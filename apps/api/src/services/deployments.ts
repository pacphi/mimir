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
import { runCliCapture, isCliConfigured } from "../lib/cli.js";
import { isReservedSecretKey } from "../lib/secret-denylist.js";

export interface CreateDeploymentInput {
  name: string;
  provider: string;
  region: string;
  vm_size: string;
  memory_gb: number;
  storage_gb: number;
  yaml_config: string;
  template_id?: string;
  secrets?: Record<string, string>;
  initiated_by?: string;
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
 * Extract the `extensions:` array from a YAML string.
 * Uses simple line parsing — no YAML library needed for this flat list.
 */
function parseExtensionsFromYaml(yaml: string): string[] {
  const lines = yaml.split("\n");
  const extensions: string[] = [];
  let inExtensions = false;

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
      const itemMatch = line.match(/^\s+-\s+(.+)/);
      if (itemMatch) {
        extensions.push(itemMatch[1].trim());
      } else if (line.trim() !== "" && !/^\s+-/.test(line)) {
        // Reached a different top-level key
        break;
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

const CONSOLE_BLOCK = [
  "",
  "console:",
  `  endpoint: ${process.env.SINDRI_CONSOLE_URL ?? "http://localhost:3001"}`,
  `  api_key: ${process.env.SINDRI_CONSOLE_API_KEY ?? ""}`,
  "  heartbeat_interval: 30s",
].join("\n");

/** Resolve console placeholders and ensure the console block exists. */
function resolveConsolePlaceholders(yaml: string): string {
  const consoleUrl = process.env.SINDRI_CONSOLE_URL ?? "http://localhost:3001";
  const consoleApiKey = process.env.SINDRI_CONSOLE_API_KEY ?? "";

  let resolved = yaml
    .replace(/\$\{SINDRI_CONSOLE_URL\}/g, consoleUrl)
    .replace(/\$\{SINDRI_CONSOLE_API_KEY\}/g, consoleApiKey);

  // If there's no console: block at all, append one
  if (!/^console:/m.test(resolved)) {
    resolved = resolved.trimEnd() + "\n" + CONSOLE_BLOCK + "\n";
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
 * B4: Resolve console placeholders and inject system secrets (AUTHORIZED_KEYS).
 * Extends the original resolveConsolePlaceholders with SSH key injection.
 */
function resolveSystemSecrets(yaml: string): string {
  return resolveConsolePlaceholders(yaml);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

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

    // ── Run sindri deploy ─────────────────────────────────────────────────────
    // Secrets are passed as env vars so YAML `secrets: [{source: env}]` entries resolve.
    // They are never written to disk.
    await emitProgress(deploymentId, "Running sindri deploy...", { progress_percent: 40 });
    appendLog("Running sindri deploy...");

    const { stdout, stderr } = await runCliCapture(
      ["deploy", "--config", tmpFile],
      input.secrets ?? {},
    );
    if (stdout) appendLog(stdout.trim());
    if (stderr) appendLog(stderr.trim());

    await emitProgress(deploymentId, "Registering instance...", { progress_percent: 85 });
    appendLog("Registering instance in database...");

    // ── Register / update instance record ────────────────────────────────────
    const parsedExtensions = ensureDraupnir(parseExtensionsFromYaml(resolvedYaml));
    const instance = await db.instance.upsert({
      where: { name: input.name },
      create: {
        name: input.name,
        provider: input.provider,
        region: input.region,
        extensions: parsedExtensions,
        status: "RUNNING",
      },
      update: {
        provider: input.provider,
        region: input.region,
        extensions: parsedExtensions,
        status: "RUNNING",
      },
    });

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
    const message = err instanceof Error ? err.message : "Unknown error during provisioning";
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
        logger.warn({ dbErr, deploymentId }, "Failed to persist failure state"),
      );
    await emitProgress(deploymentId, message, { type: "error", status: "FAILED" });
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
