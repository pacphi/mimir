/**
 * Deployment service — orchestrates instance creation across providers.
 *
 * Creates a Deployment record in Postgres (via Prisma) and kicks off an
 * async provisioning simulation that emits progress events to Redis.
 * The WebSocket gateway subscribes per-deployment and streams events to
 * the browser client.
 */

import { createHash } from "node:crypto";
import type { Deployment } from "@prisma/client";
import { db } from "../lib/db.js";
import { redis, REDIS_CHANNELS } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulated provisioning flow.
 * In production, replace each step with the real provider SDK call.
 */
async function runProvisioningFlow(
  deploymentId: string,
  input: CreateDeploymentInput,
): Promise<void> {
  const logLines: string[] = [];

  function appendLog(line: string): void {
    logLines.push(line);
  }

  try {
    // ── IN_PROGRESS ──────────────────────────────────────────────────────────
    await db.deployment.update({
      where: { id: deploymentId },
      data: { status: "IN_PROGRESS" },
    });

    await emitProgress(deploymentId, "Provisioning infrastructure...", {
      type: "status",
      status: "IN_PROGRESS",
      progress_percent: 10,
    });
    appendLog("Provisioning infrastructure...");
    await sleep(1500);

    await emitProgress(deploymentId, `Allocating VM on ${input.provider} (${input.region})...`, {
      progress_percent: 25,
    });
    appendLog(`Allocating VM on ${input.provider} (${input.region})...`);
    await sleep(1500);

    await emitProgress(deploymentId, "Configuring instance...", { progress_percent: 40 });
    appendLog("Configuring instance...");
    await sleep(1000);

    // Resolve console placeholders in YAML before applying
    const resolvedYaml = resolveConsolePlaceholders(input.yaml_config);

    await emitProgress(deploymentId, "Applying YAML configuration...", { progress_percent: 55 });
    appendLog("Applying YAML configuration...");
    await sleep(1000);

    await emitProgress(deploymentId, "Installing extensions...", { progress_percent: 70 });
    appendLog("Installing extensions...");
    await sleep(1500);

    await emitProgress(deploymentId, "Starting Sindri agent...", { progress_percent: 85 });
    appendLog("Starting Sindri agent...");
    await sleep(1000);

    // ── Register instance in DB ──────────────────────────────────────────────
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

    appendLog("Instance registered in database.");
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

    await emitProgress(deploymentId, message, {
      type: "error",
      status: "FAILED",
    });

    logger.error({ err, deploymentId }, "Deployment failed");
  }
}
