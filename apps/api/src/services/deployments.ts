/**
 * Deployment service — orchestrates instance creation across providers.
 *
 * Creates a Deployment record in Postgres (via Prisma) and invokes
 * `sindri deploy` via the CLI binary. Progress events are emitted to Redis
 * and streamed to the browser via the WebSocket gateway.
 */

import { createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Deployment } from "@prisma/client";
import { db } from "../lib/db.js";
import { redis, REDIS_CHANNELS } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { runCliCapture, isCliConfigured, ensureInstanceDir } from "../lib/cli.js";
import { isReservedSecretKey } from "../lib/secret-denylist.js";
import {
  storeDeploymentSecrets,
  resolveDeploymentSecrets,
} from "../services/drift/secrets.service.js";
import { resolveAuthorizedKeys } from "./ssh-keys.service.js";

export interface CreateDeploymentInput {
  name: string;
  provider: string;
  region: string;
  vm_size: string;
  memory_gb: number;
  storage_gb: number;
  yaml_config: string;
  template_id?: string;
  /** Remote Docker daemon URL (e.g. ssh://user@host, tcp://host:2376) */
  docker_host?: string;
  secrets?: Record<string, string>;
  initiated_by?: string;
  /** Force recreation — tears down existing container/volumes before deploying */
  force?: boolean;
  /** When redeploying, pass the existing instance ID to update it instead of creating a new record */
  existingInstanceId?: string;
}

function hashYaml(yaml: string): string {
  return createHash("sha256").update(yaml).digest("hex");
}

/**
 * Serialize a Prisma Deployment record into a plain object suitable for the
 * HTTP response (BigInt-safe, ISO dates).
 */
export function serializeDeployment(d: Deployment) {
  return {
    id: d.id,
    instance_id: d.instance_id,
    template_id: d.template_id,
    config_hash: d.config_hash,
    yaml_content: d.yaml_content,
    provider: d.provider,
    region: d.region,
    status: d.status,
    initiated_by: d.initiated_by,
    started_at: d.started_at.toISOString(),
    completed_at: d.completed_at?.toISOString() ?? null,
    logs: d.logs,
    error: d.error,
  };
}

/**
 * Create a new Deployment row and kick off the provisioning flow.
 * Returns immediately with the PENDING record.
 */
export async function createDeployment(input: CreateDeploymentInput): Promise<Deployment> {
  const configHash = hashYaml(input.yaml_config);

  const deployment = await db.deployment.create({
    data: {
      config_hash: configHash,
      yaml_content: input.yaml_config,
      provider: input.provider,
      region: input.region,
      template_id: input.template_id ?? null,
      initiated_by: input.initiated_by ?? null,
      status: "PENDING",
    },
  });

  logger.info(
    { deploymentId: deployment.id, provider: input.provider, name: input.name },
    "Deployment created",
  );

  // Fire-and-forget provisioning — HTTP response returns before it completes.
  void runProvisioningFlow(deployment.id, input);

  return deployment;
}

export async function getDeploymentById(id: string): Promise<Deployment | null> {
  return db.deployment.findUnique({ where: { id } });
}

// ─────────────────────────────────────────────────────────────────────────────
// YAML / extension helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract secret names from the `secrets:` block in the YAML.
 * Looks for entries like `- name: GITHUB_TOKEN` with `source: env`.
 */
function parseSecretNamesFromYaml(yaml: string): string[] {
  const names: string[] = [];
  const lines = yaml.split("\n");
  let inSecrets = false;

  for (const line of lines) {
    if (/^secrets:\s*$/.test(line)) {
      inSecrets = true;
      continue;
    }
    if (inSecrets) {
      const nameMatch = line.match(/^\s+-\s+name:\s+(\S+)/);
      if (nameMatch) {
        names.push(nameMatch[1]);
      } else if (line.trim() !== "" && !line.match(/^\s+(source|name):/)) {
        // Reached a different top-level key or non-secret entry
        if (!line.startsWith(" ") && !line.startsWith("\t")) break;
      }
    }
  }
  return names;
}

/**
 * Extract the `distro:` value from the deployment YAML.
 * Returns null if not specified.
 */
function parseDistroFromYaml(yaml: string): string | null {
  const match = yaml.match(/^\s+distro:\s+(\S+)/m);
  return match?.[1] ?? null;
}

/**
 * Extract the `extensions:` array from a YAML string.
 * Uses simple line parsing — no YAML library needed for this flat list.
 */
function parseExtensionsFromYaml(yaml: string): string[] {
  const lines = yaml.split("\n");
  const extensions: string[] = [];
  let inExtensions = false;
  let inActiveList = false;

  for (const line of lines) {
    if (/^extensions:\s*$/.test(line) || /^extensions:\s*\[/.test(line)) {
      // Handle inline empty array: `extensions: []`
      const inlineMatch = line.match(/^extensions:\s*\[([^\]]*)\]/);
      if (inlineMatch) {
        const items = inlineMatch[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return items;
      }
      inExtensions = true;
      continue;
    }
    if (inExtensions) {
      // Detect `active:` or `additional:` sub-keys
      if (/^\s+active:\s*$/.test(line) || /^\s+additional:\s*$/.test(line)) {
        inActiveList = true;
        continue;
      }
      // Detect other sub-keys like `auto_install:`, `profile:`
      if (/^\s+\w+:/.test(line) && !/^\s+-/.test(line)) {
        inActiveList = false;
        continue;
      }
      // Reached a new top-level key — stop
      if (line.trim() !== "" && !line.startsWith(" ") && !line.startsWith("\t")) {
        break;
      }
      // Collect list items (at any nesting level within extensions)
      const itemMatch = line.match(/^\s+-\s+(.+)/);
      if (itemMatch && (inActiveList || inExtensions)) {
        extensions.push(itemMatch[1].trim());
      }
    }
  }
  return extensions;
}

/** Ensure `draupnir` is always in the extensions list. */
function ensureDraupnir(extensions: string[]): string[] {
  if (extensions.includes("draupnir")) return extensions;
  return [...extensions, "draupnir"].sort((a, b) => a.localeCompare(b));
}

function buildConsoleBlock(): string {
  return [
    "",
    "console:",
    `  endpoint: ${resolveConsoleUrl()}`,
    `  api_key: ${process.env.SINDRI_CONSOLE_API_KEY ?? ""}`,
    "  heartbeat_interval: 30s",
  ].join("\n");
}

/**
 * Resolve the console endpoint URL, accounting for Docker networking.
 * When running on macOS/Windows and deploying to Docker, the container cannot
 * reach the host via `localhost`. We rewrite to `host.docker.internal`.
 */
function resolveConsoleUrl(): string {
  const raw = process.env.SINDRI_CONSOLE_URL ?? "http://localhost:3001";
  try {
    const url = new URL(raw);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.hostname = "host.docker.internal";
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    // Not a valid URL — return as-is
  }
  return raw;
}

/** Resolve console placeholders and ensure the console block exists. */
function resolveConsolePlaceholders(yaml: string): string {
  const consoleUrl = resolveConsoleUrl();
  const consoleApiKey = process.env.SINDRI_CONSOLE_API_KEY ?? "";

  let resolved = yaml
    .replace(/\$\{SINDRI_CONSOLE_URL\}/g, consoleUrl)
    .replace(/\$\{SINDRI_CONSOLE_API_KEY\}/g, consoleApiKey);

  // If there's no console: block at all, append one
  if (!/^console:/m.test(resolved)) {
    resolved = resolved.trimEnd() + "\n" + buildConsoleBlock() + "\n";
  }

  return resolved;
}

/**
 * B3: Scan Expert YAML for reserved secret keys in `env:` or `secrets:` blocks.
 * Returns an array of violating key names (empty = valid).
 *
 * Uses the same line-by-line approach as `parseExtensionsFromYaml`.
 */
export function validateYamlSecrets(yaml: string): string[] {
  const lines = yaml.split("\n");
  const violations: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    // Detect start of env: or secrets: block
    if (/^(?:env|secrets):\s*$/.test(line)) {
      inBlock = true;
      continue;
    }

    if (inBlock) {
      // "KEY: value" or "- KEY=value" style entries
      const kvMatch = line.match(/^\s+([A-Z_][A-Z0-9_]*):/);
      const dashMatch = line.match(/^\s+-\s+([A-Z_][A-Z0-9_]*)(?:=|:)/);
      const key = kvMatch?.[1] ?? dashMatch?.[1];

      if (key && isReservedSecretKey(key)) {
        violations.push(key);
      }

      // End of block — non-indented, non-empty line that's not a list item
      if (line.trim() !== "" && !/^\s/.test(line)) {
        inBlock = false;
      }
    }
  }

  return [...new Set(violations)];
}

/**
 * Providers that run against the local Docker daemon and can access its
 * image cache. All other providers require a registry-accessible image.
 */
const LOCAL_PROVIDERS = new Set(["docker"]);

/**
 * B4: Resolve console placeholders, inject system secrets, and ensure
 * an image reference exists.
 *
 * When the YAML contains neither `image_config:` nor `image:` under
 * `deployment:`, inject an appropriate default:
 *   - Local providers (docker): `image: <SINDRI_DEFAULT_IMAGE>` (bare local image)
 *   - Cloud providers (fly, …): `image_config:` with GHCR registry so the
 *     provider can pull the image from a registry it can reach.
 */
function resolveSystemSecrets(yaml: string): string {
  let resolved = resolveConsolePlaceholders(yaml);

  // Inject default image when no explicit image config is present
  const hasImage = /\bimage_config:/m.test(resolved) || /\bimage:/m.test(resolved);
  if (!hasImage) {
    // Detect provider from the YAML
    const providerMatch = resolved.match(/^\s+provider:\s+(\S+)/m);
    const provider = providerMatch?.[1] ?? "docker";

    if (LOCAL_PROVIDERS.has(provider)) {
      // Local provider — bare image name works (local daemon cache)
      const defaultImage = process.env.SINDRI_DEFAULT_IMAGE ?? "sindri:v3-ubuntu-dev";
      resolved = resolved.replace(
        /^(deployment:\s*\n\s+provider:\s+.+)$/m,
        `$1\n  image: ${defaultImage}`,
      );
    } else {
      // Cloud provider — must use image_config with a registry.
      // The CLI's resolve_image() does NOT append distro to the tag, so we
      // pick the correct distro-aware floating tag here.
      // GHCR convention: unsuffixed = ubuntu, others get `-{distro}` suffix.
      const registry = process.env.SINDRI_IMAGE_REGISTRY ?? "ghcr.io/pacphi/sindri";
      const version = process.env.SINDRI_IMAGE_VERSION ?? "latest";
      const distroMatch = resolved.match(/^\s+distro:\s+(\S+)/m);
      const distro = distroMatch?.[1] ?? "ubuntu";
      const tag = distro === "ubuntu" ? version : `${version}-${distro}`;
      resolved = resolved.replace(
        /^(deployment:\s*\n\s+provider:\s+.+)$/m,
        `$1\n  image_config:\n    registry: ${registry}\n    tag_override: ${tag}`,
      );
    }
  }

  // Inject platform-managed secrets into the secrets block so the Sindri CLI
  // passes them as container env vars.
  const platformSecrets = [
    "  - name: SINDRI_CONSOLE_URL",
    "    source: env",
    "  - name: SINDRI_CONSOLE_API_KEY",
    "    source: env",
    "  - name: SINDRI_INSTANCE_ID",
    "    source: env",
    "  - name: AUTHORIZED_KEYS",
    "    source: env",
  ].join("\n");

  if (/^secrets:/m.test(resolved)) {
    // Append to existing secrets block
    resolved = resolved.replace(/^(secrets:)/m, `$1\n${platformSecrets}`);
  } else {
    // Create new secrets block
    resolved = resolved.trimEnd() + "\n\nsecrets:\n" + platformSecrets + "\n";
  }

  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a user-friendly error summary from raw CLI output.
 * Strips file paths, Docker build noise, and command invocations.
 */
function sanitizeDeployError(raw: string): string {
  // Extract the first "Error: ..." line from the CLI output
  const errorLines = raw.split("\n").filter((l) => /^Error:|error:/i.test(l.trim()));
  if (errorLines.length > 0) {
    // Take the most specific error line (usually the first)
    let summary = errorLines[0].trim();
    // Strip "Command failed: /path/to/sindri ..." prefix
    summary = summary.replace(/^Command failed:\s*\S+\s*/, "");
    // Strip leading "Error: " for cleaner display
    summary = summary.replace(/^Error:\s*/, "");
    if (summary.length > 0) return summary;
  }

  // Fallback: strip command path from "Command failed: ..." messages
  const cmdMatch = raw.match(/^Command failed:\s*\S+\s*(.*)/s);
  if (cmdMatch) {
    // Take only the first meaningful line, strip Docker build step noise
    const firstLine = cmdMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("#"));
    if (firstLine) return firstLine;
  }

  // Last resort: truncate and strip paths
  return raw
    .replace(/\/[\w/.-]+\/sindri\b/g, "sindri")
    .replace(/\/tmp\/sindri-deploy-\S+/g, "<config>")
    .slice(0, 300);
}

async function emitProgress(
  deploymentId: string,
  message: string,
  opts: {
    type?: "progress" | "status" | "error" | "complete";
    status?: string;
    progress_percent?: number;
    instance_id?: string;
  } = {},
): Promise<void> {
  const event = {
    type: opts.type ?? "progress",
    deployment_id: deploymentId,
    message,
    status: opts.status,
    progress_percent: opts.progress_percent,
    instance_id: opts.instance_id,
  };

  try {
    await redis.publish(REDIS_CHANNELS.deploymentProgress(deploymentId), JSON.stringify(event));
  } catch (err) {
    logger.warn({ err, deploymentId }, "Failed to publish deployment progress event");
  }
}

/**
 * Provisioning flow — invokes `sindri deploy` via the CLI binary.
 * Fails immediately and clearly if the CLI is not configured.
 * Secrets are injected as subprocess environment variables (never written to disk).
 * The YAML temp file is overwritten with zeros before deletion.
 */
async function runProvisioningFlow(
  deploymentId: string,
  input: CreateDeploymentInput,
): Promise<void> {
  const logLines: string[] = [];
  function appendLog(line: string): void {
    logLines.push(line);
  }

  // ── Pre-flight: CLI must be configured ────────────────────────────────────
  if (!isCliConfigured()) {
    const message = "Sindri CLI is not configured — set SINDRI_BIN_PATH or install @sindri/cli";
    await db.deployment
      .update({
        where: { id: deploymentId },
        data: { status: "FAILED", error: message, completed_at: new Date(), logs: message },
      })
      .catch((dbErr: unknown) =>
        logger.warn({ dbErr, deploymentId }, "Failed to persist CLI-not-found failure"),
      );
    await emitProgress(deploymentId, message, { type: "error", status: "FAILED" });
    logger.error({ deploymentId }, message);
    return;
  }

  let tmpFile: string | null = null;
  let yamlByteLength = 0;
  let createdInstanceId: string | null = null;

  try {
    // ── IN_PROGRESS ──────────────────────────────────────────────────────────
    await db.deployment.update({
      where: { id: deploymentId },
      data: { status: "IN_PROGRESS" },
    });
    await emitProgress(deploymentId, "Starting deployment...", {
      type: "status",
      status: "IN_PROGRESS",
      progress_percent: 10,
    });
    appendLog("Starting deployment...");

    await emitProgress(deploymentId, `Targeting ${input.provider} (${input.region})...`, {
      progress_percent: 20,
    });
    appendLog(`Targeting ${input.provider} (${input.region})...`);

    // ── Write YAML to temp file ───────────────────────────────────────────────
    const resolvedYaml = resolveSystemSecrets(input.yaml_config);
    yamlByteLength = Buffer.byteLength(resolvedYaml, "utf-8");
    tmpFile = join(tmpdir(), `sindri-deploy-${deploymentId}.yaml`);
    await writeFile(tmpFile, resolvedYaml, "utf-8");

    // ── Resolve secrets ───────────────────────────────────────────────────────
    // Priority: 1) caller-supplied values (from wizard), 2) vault (from prior
    // deploy), 3) server env vars. Secrets are passed ONLY via subprocess env
    // — never written to disk.
    const secretNames = parseSecretNamesFromYaml(resolvedYaml);
    const resolvedSecrets: Record<string, string> = {};

    // Look up the most recent instance with this name for vault secret
    // resolution. Prefer an active instance, fall back to any historical one.
    const vaultInstance = await db.instance.findFirst({
      where: { name: input.name },
      orderBy: { created_at: "desc" },
      select: { id: true },
    });
    const vaultSecrets = vaultInstance ? await resolveDeploymentSecrets(vaultInstance.id) : {};

    for (const name of secretNames) {
      const value = input.secrets?.[name] ?? vaultSecrets[name] ?? process.env[name];
      if (value) resolvedSecrets[name] = value;
    }

    // Always inject console connectivity env vars so draupnir can reach Mimir.
    // These are required by the draupnir agent inside the container.
    const consoleUrl = resolveConsoleUrl();
    const consoleApiKey = process.env.SINDRI_CONSOLE_API_KEY ?? "";
    resolvedSecrets.SINDRI_CONSOLE_URL = consoleUrl;
    if (consoleApiKey) resolvedSecrets.SINDRI_CONSOLE_API_KEY = consoleApiKey;

    // Auto-resolve AUTHORIZED_KEYS for SSH access.
    // Priority: env var → server's ~/.ssh/id_ed25519.pub → ~/.ssh/id_rsa.pub
    if (!resolvedSecrets.AUTHORIZED_KEYS) {
      const sshKey = await resolveAuthorizedKeys();
      if (sshKey) resolvedSecrets.AUTHORIZED_KEYS = sshKey;
    }

    // Resolve Docker host: user-supplied → admin default → local daemon.
    // When set, DOCKER_HOST tells the Sindri CLI (and Docker Compose) to
    // target a remote Docker daemon instead of the local socket.
    const effectiveDockerHost = input.docker_host || process.env.DOCKER_HOST_DEFAULT || undefined;
    if (effectiveDockerHost) {
      resolvedSecrets.DOCKER_HOST = effectiveDockerHost;
    }

    // ── Resolve or create instance record ───────────────────────────────────
    // Two paths:
    //   1. Redeploy (existingInstanceId set) → update the existing record
    //   2. New deploy → create a fresh record (old DESTROYED/ERROR preserved)
    const parsedExtensions = ensureDraupnir(parseExtensionsFromYaml(resolvedYaml));
    const deployDistro = parseDistroFromYaml(resolvedYaml);

    let instance: { id: string; name: string };

    if (input.existingInstanceId) {
      // ── Redeploy path: update existing instance ────────────────────────
      instance = await db.instance.update({
        where: { id: input.existingInstanceId },
        data: {
          provider: input.provider,
          region: input.region,
          distro: deployDistro,
          docker_host: effectiveDockerHost ?? null,
          extensions: parsedExtensions,
          status: "DEPLOYING",
          updated_at: new Date(),
        },
        select: { id: true, name: true },
      });
    } else {
      // ── New deploy path: check name conflicts, create fresh record ─────
      const activeInstance = await db.instance.findFirst({
        where: {
          name: input.name,
          status: { notIn: ["DESTROYED", "ERROR"] },
        },
        select: { id: true, status: true },
      });

      if (activeInstance && !input.force) {
        const message = `Instance '${input.name}' already exists with status ${activeInstance.status}`;
        appendLog(`ERROR: ${message}`);
        await db.deployment
          .update({
            where: { id: deploymentId },
            data: {
              status: "FAILED",
              error: message,
              completed_at: new Date(),
              logs: logLines.join("\n"),
            },
          })
          .catch((dbErr: unknown) =>
            logger.warn({ dbErr, deploymentId }, "Failed to persist name-conflict failure"),
          );
        await emitProgress(deploymentId, message, { type: "error", status: "FAILED" });
        return;
      }

      // Auto-force when there are prior DESTROYED/ERROR instances with the
      // same name so the CLI tears down any leftover Docker containers/volumes.
      const hasHistoricalInstance = await db.instance.count({
        where: { name: input.name, status: { in: ["DESTROYED", "ERROR"] } },
      });
      if (hasHistoricalInstance > 0) {
        input.force = true;
      }

      instance = await db.instance.create({
        data: {
          name: input.name,
          provider: input.provider,
          region: input.region,
          distro: deployDistro,
          docker_host: effectiveDockerHost ?? null,
          extensions: parsedExtensions,
          status: "DEPLOYING",
        },
      });
    }

    createdInstanceId = instance.id;

    // Link the deployment to the instance immediately so the config route
    // can return the full YAML even while the deploy is still running or
    // if it fails later.
    await db.deployment
      .update({
        where: { id: deploymentId },
        data: { instance_id: instance.id },
      })
      .catch((dbErr: unknown) =>
        logger.warn({ dbErr, deploymentId }, "Failed to link deployment to instance"),
      );

    // Pass the Mimir-assigned instance ID so Draupnir can identify itself
    resolvedSecrets.SINDRI_INSTANCE_ID = instance.id;

    // ── Run sindri deploy ─────────────────────────────────────────────────────
    // Secrets are passed as subprocess env vars — the Sindri CLI reads them
    // directly from the environment (source: env). No temp file on disk.
    // Each instance gets its own working directory so Docker Compose treats
    // each deploy as a separate project (preventing orphan removal of other
    // instances' containers).
    await emitProgress(deploymentId, "Running sindri deploy...", { progress_percent: 40 });
    appendLog("Running sindri deploy...");

    const instanceDir = ensureInstanceDir(input.name);
    const cliArgs = ["deploy", "--config", tmpFile, "--skip-validation"];
    if (input.force) cliArgs.push("--force");
    const { stdout, stderr } = await runCliCapture(
      cliArgs,
      resolvedSecrets,
      undefined,
      instanceDir,
    );
    if (stdout) appendLog(stdout.trim());
    if (stderr) appendLog(stderr.trim());

    await emitProgress(deploymentId, "Registering instance...", { progress_percent: 85 });
    appendLog("Registering instance in database...");

    // ── Update instance to RUNNING ───────────────────────────────────────────
    await db.instance.update({
      where: { id: instance.id },
      data: { status: "RUNNING", updated_at: new Date() },
    });

    // ── Store secrets in vault (encrypted, instance-scoped) ────────────────
    // Only stores secrets that were explicitly provided by the caller (not env
    // fallbacks) to avoid leaking server-side env vars into the vault.
    if (input.secrets && Object.keys(input.secrets).length > 0) {
      await storeDeploymentSecrets(instance.id, input.secrets, input.initiated_by);
      appendLog(`Stored ${Object.keys(input.secrets).length} secret(s) in vault.`);
    }

    appendLog("Instance is online and ready.");

    // ── SUCCEEDED ────────────────────────────────────────────────────────────
    await db.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "SUCCEEDED",
        instance_id: instance.id,
        completed_at: new Date(),
        logs: logLines.join("\n"),
      },
    });
    await emitProgress(deploymentId, "Instance is online and ready", {
      type: "complete",
      status: "SUCCEEDED",
      progress_percent: 100,
      instance_id: instance.id,
    });
    logger.info({ deploymentId, instanceId: instance.id }, "Deployment completed successfully");
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error during provisioning";

    // Extract user-friendly summary from CLI errors (strip paths, build noise)
    const userMessage = sanitizeDeployError(rawMessage);

    appendLog(`ERROR: ${userMessage}`);
    await db.deployment
      .update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          error: rawMessage, // full error for admin/debug
          completed_at: new Date(),
          logs: logLines.join("\n"),
        },
      })
      .catch((dbErr: unknown) =>
        logger.warn({ dbErr, deploymentId }, "Failed to persist failure state"),
      );
    await emitProgress(deploymentId, userMessage, { type: "error", status: "FAILED" });
    // Mark pre-created instance as ERROR if the CLI deploy failed
    if (createdInstanceId) {
      await db.instance
        .update({
          where: { id: createdInstanceId },
          data: { status: "ERROR", updated_at: new Date() },
        })
        .catch((dbErr: unknown) =>
          logger.warn(
            { dbErr, deploymentId },
            "Failed to mark instance as ERROR after deploy failure",
          ),
        );
    }
    logger.error({ err, deploymentId }, "Deployment failed");
  } finally {
    // ── Secure cleanup ────────────────────────────────────────────────────────
    // Overwrite temp file with zeros before unlinking so YAML (which contains
    // the console API key) cannot be recovered from disk.
    if (tmpFile) {
      if (yamlByteLength > 0) {
        await writeFile(tmpFile, Buffer.alloc(yamlByteLength, 0)).catch(() => undefined);
      }
      await unlink(tmpFile).catch(() => undefined);
    }
    // Remove secret value references from the input object (best-effort —
    // V8 strings are immutable so GC handles actual memory reclamation).
    if (input.secrets) {
      for (const key of Object.keys(input.secrets)) {
        delete (input.secrets as Record<string, string>)[key];
      }
    }
  }
}
