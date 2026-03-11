/**
 * Instance lifecycle routes.
 *
 * POST   /api/v1/instances/:id/clone        — Copy config, assign new ID, deploy to provider
 * POST   /api/v1/instances/:id/redeploy     — Validate config, trigger deployment
 * GET    /api/v1/instances/:id/config       — Get current configuration YAML
 * POST   /api/v1/instances/:id/suspend      — Suspend a running instance
 * POST   /api/v1/instances/:id/resume       — Resume a suspended instance
 * POST   /api/v1/instances/:id/destroy      — Destroy with optional volume backup
 * POST   /api/v1/instances/:id/backup       — Backup instance volume
 * POST   /api/v1/instances/bulk-action      — Bulk operations on multiple instances
 * GET    /api/v1/instances/:id/lifecycle     — Available lifecycle actions
 */

import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { rateLimitDefault, rateLimitStrict } from "../../middleware/rateLimit.js";
import { db } from "../../lib/db.js";
import { redis, REDIS_CHANNELS } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";
import {
  suspendInstance,
  resumeInstance,
  destroyInstance,
  getAvailableActions,
  bulkInstanceAction,
} from "../../services/lifecycle.js";
import { createDeployment } from "../../services/deployments.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const CloneInstanceSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Name must be lowercase alphanumeric and hyphens"),
  provider: z.enum(["fly", "docker", "devpod", "e2b", "kubernetes"]).optional(),
  region: z.string().max(64).optional(),
});

const RedeployInstanceSchema = z.object({
  config: z.string().max(65536).optional(),
  force: z.boolean().default(false),
});

const DestroyInstanceSchema = z.object({
  backupVolume: z.boolean().default(false),
  backupLabel: z.string().max(128).optional(),
});

const BackupVolumeSchema = z.object({
  label: z.string().max(128).optional(),
  compression: z.enum(["none", "gzip", "zstd"]).default("gzip"),
});

const BulkActionSchema = z.object({
  instanceIds: z.array(z.string().min(1).max(128)).min(1).max(50),
  action: z.enum(["suspend", "resume", "destroy"]),
  options: z
    .object({
      backupVolume: z.boolean().default(false),
    })
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const lifecycle = new Hono();

lifecycle.use("*", authMiddleware);

// ─── GET /api/v1/instances/:id/config ────────────────────────────────────────

lifecycle.get("/:id/config", rateLimitDefault, async (c) => {
  const id = c.req.param("id")!;
  if (!id || id.length > 128) {
    return c.json({ error: "Bad Request", message: "Invalid instance ID" }, 400);
  }

  try {
    const instance = await db.instance.findUnique({ where: { id } });
    if (!instance) {
      return c.json({ error: "Not Found", message: `Instance '${id}' not found` }, 404);
    }

    // Prefer the original yaml_content from the most recent successful deployment
    const latestDeployment = await db.deployment.findFirst({
      where: { instance_id: id, status: { in: ["SUCCEEDED", "IN_PROGRESS"] } },
      orderBy: { started_at: "desc" },
      select: { yaml_content: true, config_hash: true },
    });

    const config = latestDeployment?.yaml_content ?? buildConfigYaml(instance);

    return c.json({
      instanceId: instance.id,
      name: instance.name,
      config,
      configHash: latestDeployment?.config_hash ?? instance.config_hash,
      updatedAt: instance.updated_at.toISOString(),
    });
  } catch (err) {
    logger.error({ err, instanceId: id }, "Failed to fetch instance config");
    return c.json(
      { error: "Internal Server Error", message: "Failed to fetch instance config" },
      500,
    );
  }
});

// ─── POST /api/v1/instances/:id/clone ────────────────────────────────────────

lifecycle.post("/:id/clone", rateLimitStrict, requireRole("OPERATOR"), async (c) => {
  const id = c.req.param("id")!;
  if (!id || id.length > 128) {
    return c.json({ error: "Bad Request", message: "Invalid instance ID" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Bad Request", message: "Request body must be valid JSON" }, 400);
  }

  const parseResult = CloneInstanceSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      {
        error: "Validation Error",
        message: "Invalid request body",
        details: parseResult.error.flatten(),
      },
      422,
    );
  }

  try {
    const source = await db.instance.findUnique({ where: { id } });
    if (!source) {
      return c.json({ error: "Not Found", message: `Instance '${id}' not found` }, 404);
    }

    const nameConflict = await db.instance.findUnique({ where: { name: parseResult.data.name } });
    if (nameConflict) {
      return c.json(
        {
          error: "Conflict",
          message: `Instance name '${parseResult.data.name}' is already in use`,
        },
        409,
      );
    }

    const cloned = await db.instance.create({
      data: {
        name: parseResult.data.name,
        provider: parseResult.data.provider ?? source.provider,
        region: parseResult.data.region ?? source.region,
        extensions: source.extensions,
        config_hash: source.config_hash,
        ssh_endpoint: null,
        status: "DEPLOYING",
      },
    });

    await db.event.create({
      data: {
        instance_id: source.id,
        event_type: "DEPLOY",
        metadata: {
          triggered_by: "api",
          operation: "clone_source",
          cloned_to: cloned.id,
          cloned_name: cloned.name,
        },
      },
    });

    await db.event.create({
      data: {
        instance_id: cloned.id,
        event_type: "DEPLOY",
        metadata: {
          triggered_by: "api",
          cloned_from: source.id,
          source_name: source.name,
        },
      },
    });

    publishInstanceEvent(cloned.id, "clone", {
      clonedFrom: source.id,
      sourceName: source.name,
      provider: cloned.provider,
    });

    logger.info({ sourceId: source.id, clonedId: cloned.id, name: cloned.name }, "Instance cloned");

    return c.json(
      {
        id: cloned.id,
        name: cloned.name,
        provider: cloned.provider,
        region: cloned.region,
        extensions: cloned.extensions,
        configHash: cloned.config_hash,
        status: cloned.status,
        clonedFrom: source.id,
        createdAt: cloned.created_at.toISOString(),
        updatedAt: cloned.updated_at.toISOString(),
      },
      201,
    );
  } catch (err) {
    logger.error({ err, instanceId: id }, "Failed to clone instance");
    return c.json({ error: "Internal Server Error", message: "Failed to clone instance" }, 500);
  }
});

// ─── POST /api/v1/instances/:id/redeploy ─────────────────────────────────────

lifecycle.post("/:id/redeploy", rateLimitStrict, requireRole("OPERATOR"), async (c) => {
  const id = c.req.param("id")!;
  if (!id || id.length > 128) {
    return c.json({ error: "Bad Request", message: "Invalid instance ID" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Bad Request", message: "Request body must be valid JSON" }, 400);
  }

  const parseResult = RedeployInstanceSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      {
        error: "Validation Error",
        message: "Invalid request body",
        details: parseResult.error.flatten(),
      },
      422,
    );
  }

  try {
    const instance = await db.instance.findUnique({ where: { id } });
    if (!instance) {
      return c.json({ error: "Not Found", message: `Instance '${id}' not found` }, 404);
    }

    if (
      !parseResult.data.force &&
      (instance.status === "DEPLOYING" || instance.status === "DESTROYING")
    ) {
      return c.json(
        {
          error: "Conflict",
          message: `Instance is currently in '${instance.status}' state. Use force=true to override.`,
        },
        409,
      );
    }

    // Resolve the config to use: caller-supplied override, latest deployment, or reconstructed
    let yamlConfig = parseResult.data.config;
    if (!yamlConfig) {
      const latestDeployment = await db.deployment.findFirst({
        where: { instance_id: id, status: { in: ["SUCCEEDED", "IN_PROGRESS"] } },
        orderBy: { started_at: "desc" },
        select: { yaml_content: true },
      });
      yamlConfig = latestDeployment?.yaml_content ?? buildConfigYaml(instance);
    }

    await db.instance.update({
      where: { id },
      data: { status: "DEPLOYING", updated_at: new Date() },
    });

    await db.event.create({
      data: {
        instance_id: id,
        event_type: "REDEPLOY",
        metadata: {
          triggered_by: "api",
          force: parseResult.data.force,
          has_config_update: Boolean(parseResult.data.config),
        },
      },
    });

    publishInstanceEvent(id, "redeploy", {
      name: instance.name,
      provider: instance.provider,
      force: parseResult.data.force,
    });

    // Actually run the deployment with --force to tear down existing container/volumes
    const deployment = await createDeployment({
      name: instance.name,
      provider: instance.provider,
      region: instance.region ?? "local",
      vm_size: "medium",
      memory_gb: 4,
      storage_gb: 20,
      yaml_config: yamlConfig,
      initiated_by: c.get("auth")?.userId,
      force: true,
    });

    logger.info(
      {
        instanceId: id,
        deploymentId: deployment.id,
        name: instance.name,
        force: parseResult.data.force,
      },
      "Instance redeploy triggered via deployment",
    );

    return c.json({
      id: instance.id,
      name: instance.name,
      status: "DEPLOYING",
      deploymentId: deployment.id,
      message: "Redeploy triggered successfully",
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Revert status if deployment creation failed
    await db.instance
      .update({
        where: { id },
        data: { status: "ERROR", updated_at: new Date() },
      })
      .catch(() => {});
    logger.error({ err, instanceId: id }, "Failed to trigger redeploy");
    return c.json({ error: "Internal Server Error", message: "Failed to trigger redeploy" }, 500);
  }
});

// ─── POST /api/v1/instances/:id/suspend ──────────────────────────────────────

lifecycle.post("/:id/suspend", rateLimitStrict, requireRole("OPERATOR"), async (c) => {
  const id = c.req.param("id")!;
  if (!id || id.length > 128) {
    return c.json({ error: "Bad Request", message: "Invalid instance ID" }, 400);
  }

  try {
    const instance = await suspendInstance(id);
    if (!instance) {
      return c.json({ error: "Not Found", message: `Instance '${id}' not found` }, 404);
    }
    return c.json({
      message: "Instance suspended",
      id: instance.id,
      name: instance.name,
      status: instance.status,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("cannot be suspended")) {
      return c.json({ error: "Conflict", message: err.message }, 409);
    }
    const message = err instanceof Error ? err.message : "Failed to suspend instance";
    logger.error({ err, instanceId: id }, "Failed to suspend instance");
    return c.json({ error: "Internal Server Error", message }, 500);
  }
});

// ─── POST /api/v1/instances/:id/resume ───────────────────────────────────────

lifecycle.post("/:id/resume", rateLimitStrict, requireRole("OPERATOR"), async (c) => {
  const id = c.req.param("id")!;
  if (!id || id.length > 128) {
    return c.json({ error: "Bad Request", message: "Invalid instance ID" }, 400);
  }

  try {
    const instance = await resumeInstance(id);
    if (!instance) {
      return c.json({ error: "Not Found", message: `Instance '${id}' not found` }, 404);
    }
    return c.json({
      message: "Instance resumed",
      id: instance.id,
      name: instance.name,
      status: instance.status,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("cannot be resumed")) {
      return c.json({ error: "Conflict", message: err.message }, 409);
    }
    const message = err instanceof Error ? err.message : "Failed to resume instance";
    logger.error({ err, instanceId: id }, "Failed to resume instance");
    return c.json({ error: "Internal Server Error", message }, 500);
  }
});

// ─── POST /api/v1/instances/:id/destroy ──────────────────────────────────────

lifecycle.post("/:id/destroy", rateLimitStrict, requireRole("OPERATOR"), async (c) => {
  const id = c.req.param("id")!;
  if (!id || id.length > 128) {
    return c.json({ error: "Bad Request", message: "Invalid instance ID" }, 400);
  }

  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return c.json({ error: "Bad Request", message: "Request body must be valid JSON" }, 400);
  }

  const parseResult = DestroyInstanceSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      {
        error: "Validation Error",
        message: "Invalid request body",
        details: parseResult.error.flatten(),
      },
      422,
    );
  }

  try {
    const result = await destroyInstance(id, parseResult.data);
    if (!result) {
      return c.json({ error: "Not Found", message: `Instance '${id}' not found` }, 404);
    }
    return c.json({
      message: "Instance destroyed",
      id: result.instance.id,
      name: result.instance.name,
      status: result.instance.status,
      backupId: result.backupId ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("cannot be destroyed")) {
      return c.json({ error: "Conflict", message: err.message }, 409);
    }
    if (err instanceof Error && err.message.includes("Failed to tear down infrastructure")) {
      logger.error({ err, instanceId: id }, "Infrastructure teardown failed");
      return c.json({ error: "Teardown Failed", message: err.message }, 502);
    }
    logger.error({ err, instanceId: id }, "Failed to destroy instance");
    return c.json({ error: "Internal Server Error", message: "Failed to destroy instance" }, 500);
  }
});

// ─── POST /api/v1/instances/:id/backup ───────────────────────────────────────

lifecycle.post("/:id/backup", rateLimitStrict, requireRole("OPERATOR"), async (c) => {
  const id = c.req.param("id")!;
  if (!id || id.length > 128) {
    return c.json({ error: "Bad Request", message: "Invalid instance ID" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Bad Request", message: "Request body must be valid JSON" }, 400);
  }

  const parseResult = BackupVolumeSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      {
        error: "Validation Error",
        message: "Invalid request body",
        details: parseResult.error.flatten(),
      },
      422,
    );
  }

  try {
    const instance = await db.instance.findUnique({ where: { id } });
    if (!instance) {
      return c.json({ error: "Not Found", message: `Instance '${id}' not found` }, 404);
    }

    const { randomUUID } = await import("node:crypto");
    const backupId = randomUUID();
    const label = parseResult.data.label ?? `backup-${instance.name}-${Date.now()}`;
    const createdAt = new Date().toISOString();

    const backupMeta = {
      id: backupId,
      instanceId: id,
      label,
      status: "pending",
      compression: parseResult.data.compression,
      createdAt,
    };

    await redis
      .set(`sindri:backups:${backupId}`, JSON.stringify(backupMeta), "EX", 86400 * 30)
      .catch(() => {});

    await db.event.create({
      data: {
        instance_id: id,
        event_type: "BACKUP",
        metadata: {
          backup_id: backupId,
          label,
          compression: parseResult.data.compression,
          triggered_by: "api",
        },
      },
    });

    publishInstanceEvent(id, "backup", { name: instance.name, backupId, label });

    logger.info({ instanceId: id, backupId, label }, "Volume backup initiated");

    return c.json(
      {
        message: "Volume backup initiated",
        backupId,
        instanceId: id,
        label,
        status: "pending",
        createdAt,
      },
      202,
    );
  } catch (err) {
    logger.error({ err, instanceId: id }, "Failed to backup instance volume");
    return c.json(
      { error: "Internal Server Error", message: "Failed to initiate volume backup" },
      500,
    );
  }
});

// ─── POST /api/v1/instances/bulk-action ──────────────────────────────────────

lifecycle.post("/bulk-action", rateLimitStrict, requireRole("OPERATOR"), async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Bad Request", message: "Request body must be valid JSON" }, 400);
  }

  const parseResult = BulkActionSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      {
        error: "Validation Error",
        message: "Invalid request body",
        details: parseResult.error.flatten(),
      },
      422,
    );
  }

  try {
    const results = await bulkInstanceAction(parseResult.data);
    return c.json({
      message: `Bulk ${parseResult.data.action} completed`,
      action: parseResult.data.action,
      results: results.map((r) => ({
        id: r.id,
        name: r.name,
        success: r.success,
        error: r.error ?? null,
        newStatus: r.newStatus ?? null,
      })),
      summary: {
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to execute bulk action");
    return c.json(
      { error: "Internal Server Error", message: "Failed to execute bulk action" },
      500,
    );
  }
});

// ─── GET /api/v1/instances/:id/lifecycle ─────────────────────────────────────

lifecycle.get("/:id/lifecycle", rateLimitDefault, async (c) => {
  const id = c.req.param("id")!;
  if (!id || id.length > 128) {
    return c.json({ error: "Bad Request", message: "Invalid instance ID" }, 400);
  }

  try {
    const instance = await db.instance.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!instance) {
      return c.json({ error: "Not Found", message: `Instance '${id}' not found` }, 404);
    }

    const actions = getAvailableActions(instance.status);
    return c.json({ instanceId: id, status: instance.status, availableActions: actions });
  } catch (err) {
    logger.error({ err, instanceId: id }, "Failed to get lifecycle actions");
    return c.json(
      { error: "Internal Server Error", message: "Failed to retrieve lifecycle actions" },
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildConfigYaml(instance: {
  id: string;
  name: string;
  provider: string;
  region: string | null;
  extensions: string[];
  config_hash: string | null;
  ssh_endpoint: string | null;
  status: string;
}): string {
  const lines: string[] = [
    `# Sindri instance configuration`,
    `name: ${instance.name}`,
    `provider: ${instance.provider}`,
  ];

  if (instance.region) {
    lines.push(`region: ${instance.region}`);
  }

  lines.push(`status: ${instance.status}`);

  if (instance.extensions.length > 0) {
    lines.push("extensions:");
    for (const ext of instance.extensions) {
      lines.push(`  - ${ext}`);
    }
  } else {
    lines.push("extensions: []");
  }

  if (instance.ssh_endpoint) {
    lines.push(`ssh_endpoint: ${instance.ssh_endpoint}`);
  }

  if (instance.config_hash) {
    lines.push(`config_hash: ${instance.config_hash}`);
  }

  return lines.join("\n");
}

function publishInstanceEvent(
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

export { lifecycle as lifecycleRouter };
