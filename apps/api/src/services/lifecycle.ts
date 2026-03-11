/**
 * Instance lifecycle service — suspend, resume, destroy, backup, bulk actions.
 *
 * Single source of truth for all instance state transitions.
 * Handles state validation, infra teardown, and emits Redis events for real-time updates.
 */

import { type Instance, type InstanceStatus, EventType } from "@prisma/client";
import { db } from "../lib/db.js";
import { redis, REDIS_CHANNELS } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { randomUUID } from "crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isCliConfigured, runCliCapture } from "../lib/cli.js";

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────────────────────────────────────

export interface DestroyInstanceInput {
  backupVolume: boolean;
  backupLabel?: string;
  skipInfraTeardown?: boolean;
}

export interface BackupVolumeInput {
  label?: string;
  compression: "none" | "gzip" | "zstd";
}

export interface BulkActionInput {
  instanceIds: string[];
  action: "suspend" | "resume" | "destroy";
  options?: {
    backupVolume: boolean;
  };
}

export interface VolumeBackup {
  id: string;
  instanceId: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  compression: string;
  createdAt: string;
}

export interface BulkActionResult {
  id: string;
  name: string;
  success: boolean;
  error?: string;
  newStatus?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Available actions per status
// ─────────────────────────────────────────────────────────────────────────────

export function getAvailableActions(status: string): string[] {
  switch (status) {
    case "RUNNING":
      return ["suspend", "destroy", "backup"];
    case "SUSPENDED":
      return ["resume", "destroy", "backup"];
    case "STOPPED":
      return ["resume", "destroy"];
    case "ERROR":
      return ["resume", "destroy"];
    default:
      return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle service methods
// ─────────────────────────────────────────────────────────────────────────────

const DESTROYABLE_STATUSES = ["RUNNING", "SUSPENDED", "STOPPED", "ERROR", "DESTROYING"];

/**
 * Suspend a RUNNING instance (sets status to SUSPENDED).
 * Only RUNNING instances can be suspended.
 * Pauses/stops the underlying infrastructure so it stops consuming resources.
 */
export async function suspendInstance(id: string): Promise<Instance | null> {
  const existing = await db.instance.findUnique({ where: { id } });
  if (!existing) return null;

  if (existing.status !== "RUNNING") {
    throw new Error(
      `Instance '${existing.name}' cannot be suspended: current status is ${existing.status}`,
    );
  }

  // Stop the underlying infrastructure
  await suspendInstanceInfra(existing.name, existing.provider);

  const instance = await db.instance.update({
    where: { id },
    data: { status: "SUSPENDED", updated_at: new Date() },
  });

  await db.event.create({
    data: {
      instance_id: id,
      event_type: EventType.SUSPEND,
      metadata: { triggered_by: "api", previous_status: "RUNNING" },
    },
  });

  publishLifecycleEvent(id, "suspend", { name: instance.name, status: instance.status });

  logger.info({ instanceId: id, name: instance.name }, "Instance suspended");
  return instance;
}

/**
 * Resume an instance (sets status to RUNNING).
 * Instances in SUSPENDED, STOPPED, or ERROR status can be resumed.
 * Attempts to start the underlying infrastructure before updating the DB.
 */
export async function resumeInstance(id: string): Promise<Instance | null> {
  const existing = await db.instance.findUnique({ where: { id } });
  if (!existing) return null;

  const resumableStatuses = ["SUSPENDED", "STOPPED", "ERROR"];
  if (!resumableStatuses.includes(existing.status)) {
    throw new Error(
      `Instance '${existing.name}' cannot be resumed: current status is ${existing.status}`,
    );
  }

  // Start the underlying infrastructure before marking as RUNNING
  await resumeInstanceInfra(existing.name, existing.provider);

  const previousStatus = existing.status;
  const instance = await db.instance.update({
    where: { id },
    data: { status: "RUNNING", updated_at: new Date() },
  });

  await db.event.create({
    data: {
      instance_id: id,
      event_type: "RESUME",
      metadata: { triggered_by: "api", previous_status: previousStatus },
    },
  });

  publishLifecycleEvent(id, "resume", { name: instance.name, status: instance.status });

  logger.info({ instanceId: id, name: instance.name }, "Instance resumed");
  return instance;
}

/**
 * Destroy an instance with optional volume backup.
 *
 * When `skipInfraTeardown` is true (agent self-deregistration), sets status to STOPPED.
 * Otherwise tears down infrastructure and sets status to DESTROYED.
 */
export async function destroyInstance(
  id: string,
  input: DestroyInstanceInput,
): Promise<{ instance: Instance; backupId?: string } | null> {
  const existing = await db.instance.findUnique({ where: { id } });
  if (!existing) return null;

  if (!DESTROYABLE_STATUSES.includes(existing.status)) {
    throw new Error(
      `Instance '${existing.name}' cannot be destroyed: current status is ${existing.status}`,
    );
  }

  // Transition to DESTROYING state (skip if already DESTROYING from a previous failed attempt)
  if (existing.status !== "DESTROYING") {
    await db.instance.update({
      where: { id },
      data: { status: "DESTROYING", updated_at: new Date() },
    });
  }

  publishLifecycleEvent(id, "destroying", { name: existing.name });

  let backupId: string | undefined;

  // Optionally backup volume before destroying
  if (input.backupVolume) {
    const backup = await backupInstanceVolume(id, {
      label: input.backupLabel ?? `pre-destroy-${existing.name}-${Date.now()}`,
      compression: "gzip",
    });
    if (backup) {
      backupId = backup.id;
    }
  }

  let finalStatus: InstanceStatus;
  let infraTornDown = false;

  if (input.skipInfraTeardown) {
    // Agent self-deregistration — infra may still exist
    finalStatus = "STOPPED";
  } else {
    // Full destroy — tear down infrastructure
    infraTornDown = await destroyInstanceInfra(existing.name, existing.provider);

    if (!infraTornDown) {
      // Leave in DESTROYING state so the user can see it failed and retry
      await db.event.create({
        data: {
          instance_id: id,
          event_type: "DESTROY",
          metadata: {
            triggered_by: "api",
            backup_id: backupId ?? null,
            volume_backed_up: input.backupVolume,
            infra_torn_down: false,
            final_status: "DESTROYING",
            error: "Infrastructure teardown failed — container may still be running",
          },
        },
      });

      // Revert to ERROR so the instance is actionable (retryable destroy, etc.)
      await db.instance.update({
        where: { id },
        data: { status: "ERROR", updated_at: new Date() },
      });

      publishLifecycleEvent(id, "error", {
        name: existing.name,
        reason: "Infrastructure teardown failed",
      });

      throw new Error(
        `Failed to tear down infrastructure for '${existing.name}' — ` +
          `the container may still be running. Check the API logs for details.`,
      );
    }

    finalStatus = "DESTROYED";
  }

  const instance = await db.instance.update({
    where: { id },
    data: { status: finalStatus, updated_at: new Date() },
  });

  await db.event.create({
    data: {
      instance_id: id,
      event_type: "DESTROY",
      metadata: {
        triggered_by: "api",
        backup_id: backupId ?? null,
        volume_backed_up: input.backupVolume,
        infra_torn_down: infraTornDown,
        final_status: finalStatus,
      },
    },
  });

  publishLifecycleEvent(id, "destroy", { name: instance.name });

  // Remove from active agents set in Redis
  await redis.srem("sindri:agents:active", id).catch(() => {});

  // Hard-delete deployment secrets from the vault — no recovery after destroy
  if (finalStatus === "DESTROYED") {
    const deleted = await db.secret
      .deleteMany({ where: { instance_id: id, scope: { has: "deployment" } } })
      .catch((err: unknown) => {
        logger.warn({ err, instanceId: id }, "Failed to purge deployment secrets from vault");
        return { count: 0 };
      });
    if (deleted.count > 0) {
      logger.info({ instanceId: id, count: deleted.count }, "Deployment secrets purged from vault");
    }
  }

  logger.info({ instanceId: id, name: instance.name, backupId, finalStatus }, "Instance destroyed");
  return { instance, backupId };
}

/**
 * Initiate a volume backup for an instance.
 * Returns backup metadata (backup is async — status starts as 'pending').
 */
export async function backupInstanceVolume(
  id: string,
  input: BackupVolumeInput,
): Promise<VolumeBackup | null> {
  const existing = await db.instance.findUnique({ where: { id } });
  if (!existing) return null;

  const backupId = randomUUID();
  const label = input.label ?? `backup-${existing.name}-${Date.now()}`;
  const createdAt = new Date().toISOString();

  // Store backup metadata in Redis (in production this would be persisted to DB)
  const backupMeta: VolumeBackup = {
    id: backupId,
    instanceId: id,
    label,
    status: "pending",
    compression: input.compression,
    createdAt,
  };

  await redis
    .set(`sindri:backups:${backupId}`, JSON.stringify(backupMeta), "EX", 86400 * 30)
    .catch(() => {});

  // Record backup event
  await db.event.create({
    data: {
      instance_id: id,
      event_type: "BACKUP",
      metadata: {
        backup_id: backupId,
        label,
        compression: input.compression,
        triggered_by: "api",
      },
    },
  });

  publishLifecycleEvent(id, "backup", { name: existing.name, backupId, label });

  logger.info({ instanceId: id, backupId, label }, "Volume backup initiated");
  return backupMeta;
}

/**
 * Execute the same lifecycle action on multiple instances in parallel.
 * Returns per-instance results including successes and failures.
 */
export async function bulkInstanceAction(input: BulkActionInput): Promise<BulkActionResult[]> {
  const results = await Promise.allSettled(
    input.instanceIds.map(async (instanceId): Promise<BulkActionResult> => {
      try {
        let newStatus: string | undefined;

        switch (input.action) {
          case "suspend": {
            const instance = await suspendInstance(instanceId);
            if (!instance) {
              return {
                id: instanceId,
                name: instanceId,
                success: false,
                error: "Instance not found",
              };
            }
            newStatus = instance.status;
            return { id: instanceId, name: instance.name, success: true, newStatus };
          }

          case "resume": {
            const instance = await resumeInstance(instanceId);
            if (!instance) {
              return {
                id: instanceId,
                name: instanceId,
                success: false,
                error: "Instance not found",
              };
            }
            newStatus = instance.status;
            return { id: instanceId, name: instance.name, success: true, newStatus };
          }

          case "destroy": {
            const result = await destroyInstance(instanceId, {
              backupVolume: input.options?.backupVolume ?? false,
            });
            if (!result) {
              return {
                id: instanceId,
                name: instanceId,
                success: false,
                error: "Instance not found",
              };
            }
            newStatus = result.instance.status;
            return { id: instanceId, name: result.instance.name, success: true, newStatus };
          }
        }
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : "Unknown error";
        logger.warn({ instanceId, action: input.action, err }, "Bulk action failed for instance");
        return { id: instanceId, name: instanceId, success: false, error: errMessage };
      }
    }),
  );

  return results.map((r) => {
    if (r.status === "fulfilled") return r.value;
    return {
      id: "unknown",
      name: "unknown",
      success: false,
      error: r.reason instanceof Error ? r.reason.message : "Unexpected error",
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Destroy the instance's infrastructure using the Sindri CLI when available.
 * Falls back to direct Docker commands for the `docker` provider when the
 * Sindri CLI is not installed.
 *
 * Returns `true` if infrastructure was actually torn down, `false` otherwise.
 *
 * The Sindri CLI handles provider-specific teardown:
 *   - Docker: docker-compose down + volume cleanup
 *   - Fly.io: fly apps destroy
 *   - E2B:    sandbox delete
 *   - K8s:    kubectl delete deployment
 *   - RunPod: pod termination via API
 *   - Northflank: service deletion via API
 *   - DevPod: devpod delete
 */
async function destroyInstanceInfra(instanceName: string, provider: string): Promise<boolean> {
  // ── Try Sindri CLI first ───────────────────────────────────────────────────
  if (isCliConfigured()) {
    let tmpFile: string | null = null;
    try {
      const minimalYaml = [
        'version: "3.0"',
        `name: ${instanceName}`,
        "deployment:",
        `  provider: ${provider}`,
      ].join("\n");

      tmpFile = join(tmpdir(), `sindri-destroy-${instanceName}-${Date.now()}.yaml`);
      await writeFile(tmpFile, minimalYaml, "utf-8");

      await runCliCapture(["destroy", "--force", "--config", tmpFile]);
      logger.info({ instanceName, provider }, "Instance destroyed via Sindri CLI");
      return true;
    } catch (err) {
      logger.warn({ err, instanceName, provider }, "Sindri CLI destroy failed");
      // Fall through to provider-specific fallback
    } finally {
      if (tmpFile) await unlink(tmpFile).catch(() => undefined);
    }
  }

  // ── Fallback: direct Docker teardown ────────────────────────────────────────
  if (provider === "docker") {
    return destroyDockerInfra(instanceName);
  }

  logger.warn(
    { instanceName, provider },
    "Sindri CLI not configured and no fallback available — infrastructure NOT torn down",
  );
  return false;
}

/**
 * Direct Docker teardown — stop & remove the container, then remove its
 * associated named volume.  Used as a fallback when the Sindri CLI is not
 * installed (common in local development).
 *
 * Container naming convention: the container name matches the instance name.
 * Volume naming convention: `<instanceName>_home` (docker-compose default).
 */
async function destroyDockerInfra(instanceName: string): Promise<boolean> {
  const timeout = 30_000;
  let tornDown = false;

  // 1. Stop + remove container
  try {
    await execFileAsync("docker", ["rm", "-f", instanceName], { timeout });
    logger.info({ instanceName }, "Docker container removed");
    tornDown = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "No such container" is fine — already removed
    if (!msg.includes("No such container")) {
      logger.warn({ err, instanceName }, "Failed to remove Docker container");
    } else {
      tornDown = true; // already gone
    }
  }

  // 2. Remove the associated volume (docker-compose naming: <name>_home)
  const volumeName = `${instanceName}_home`;
  try {
    await execFileAsync("docker", ["volume", "rm", "-f", volumeName], { timeout });
    logger.info({ instanceName, volumeName }, "Docker volume removed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("No such volume")) {
      logger.warn({ err, instanceName, volumeName }, "Failed to remove Docker volume");
    }
  }

  return tornDown;
}

/**
 * Suspend (stop) the instance's infrastructure via `sindri stop`.
 * Falls back to `docker stop` for the docker provider.
 */
async function suspendInstanceInfra(instanceName: string, provider: string): Promise<void> {
  if (isCliConfigured()) {
    let tmpFile: string | null = null;
    try {
      const minimalYaml = [
        'version: "3.0"',
        `name: ${instanceName}`,
        "deployment:",
        `  provider: ${provider}`,
      ].join("\n");

      tmpFile = join(tmpdir(), `sindri-stop-${instanceName}-${Date.now()}.yaml`);
      await writeFile(tmpFile, minimalYaml, "utf-8");

      await runCliCapture(["stop", "--config", tmpFile]);
      logger.info({ instanceName, provider }, "Instance stopped via Sindri CLI");
      return;
    } catch (err) {
      logger.warn({ err, instanceName, provider }, "Sindri CLI stop failed");
    } finally {
      if (tmpFile) await unlink(tmpFile).catch(() => undefined);
    }
  }

  // Fallback: direct Docker stop
  if (provider === "docker") {
    try {
      await execFileAsync("docker", ["stop", instanceName], { timeout: 30_000 });
      logger.info({ instanceName }, "Docker container stopped");
    } catch (err) {
      logger.warn({ err, instanceName }, "Failed to stop Docker container");
    }
    return;
  }

  logger.warn(
    { instanceName, provider },
    "Sindri CLI not configured and no fallback — cannot stop",
  );
}

/**
 * Resume (start) the instance's infrastructure via `sindri start`.
 * Falls back to `docker start` for the docker provider.
 */
async function resumeInstanceInfra(instanceName: string, provider: string): Promise<void> {
  if (isCliConfigured()) {
    let tmpFile: string | null = null;
    try {
      const minimalYaml = [
        'version: "3.0"',
        `name: ${instanceName}`,
        "deployment:",
        `  provider: ${provider}`,
      ].join("\n");

      tmpFile = join(tmpdir(), `sindri-start-${instanceName}-${Date.now()}.yaml`);
      await writeFile(tmpFile, minimalYaml, "utf-8");

      await runCliCapture(["start", "--config", tmpFile]);
      logger.info({ instanceName, provider }, "Instance started via Sindri CLI");
      return;
    } catch (err) {
      logger.warn({ err, instanceName, provider }, "Sindri CLI start failed");
    } finally {
      if (tmpFile) await unlink(tmpFile).catch(() => undefined);
    }
  }

  // Fallback: direct Docker start
  if (provider === "docker") {
    try {
      await execFileAsync("docker", ["start", instanceName], { timeout: 30_000 });
      logger.info({ instanceName }, "Docker container started");
    } catch (err) {
      logger.warn({ err, instanceName }, "Failed to start Docker container");
    }
    return;
  }

  logger.warn(
    { instanceName, provider },
    "Sindri CLI not configured and no fallback — cannot start",
  );
}

function publishLifecycleEvent(
  instanceId: string,
  eventType: string,
  metadata: Record<string, unknown>,
): void {
  const channel = REDIS_CHANNELS.instanceEvents(instanceId);
  const payload = JSON.stringify({ eventType, metadata, ts: Date.now() });
  redis
    .publish(channel, payload)
    .catch((err: unknown) =>
      logger.warn({ err, instanceId, eventType }, "Failed to publish lifecycle event to Redis"),
    );
}
