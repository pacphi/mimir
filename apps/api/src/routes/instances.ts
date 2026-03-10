/**
 * Instance registry routes.
 *
 * POST   /api/v1/instances        — register (or re-register) an instance
 * GET    /api/v1/instances        — list instances with optional filters
 * GET    /api/v1/instances/:id    — get instance details + last heartbeat
 * DELETE /api/v1/instances/:id    — deregister an instance
 */

import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { rateLimitDefault, rateLimitStrict } from "../middleware/rateLimit.js";
import {
  registerInstance,
  listInstances,
  getInstanceById,
  deregisterInstance,
} from "../services/instances.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { getVisibleInstanceFilter } from "../lib/team-scope.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const providerEnum = z.enum([
  "fly",
  "docker",
  "devpod",
  "e2b",
  "kubernetes",
  "digitalocean",
  "gcp",
  "azure",
  "aws",
  "runpod",
  "northflank",
  "ssh",
]);

const RegisterInstanceSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Name must be lowercase alphanumeric and hyphens"),
  provider: providerEnum,
  region: z.string().max(64).optional(),
  extensions: z.array(z.string().min(1).max(128)).max(200).default([]),
  configHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "Must be a SHA-256 hex string")
    .optional(),
  sshEndpoint: z.string().max(256).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  geo: z
    .object({
      lat: z.number().min(-90).max(90).optional(),
      lon: z.number().min(-180).max(180).optional(),
      city: z.string().max(128).optional(),
      source: z.string().max(32).optional(),
    })
    .optional(),
});

/**
 * Agent registration schema — sent by Draupnir on boot.
 * Maps instance_id/hostname → name for compatibility with the instance registry.
 */
const AgentRegistrationSchema = z.object({
  instance_id: z.string().min(1).max(128),
  hostname: z.string().max(256).optional(),
  provider: providerEnum,
  region: z.string().max(64).optional(),
  agent_version: z.string().max(64).optional(),
  os: z.string().max(32).optional(),
  arch: z.string().max(32).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  timestamp: z.string().optional(),
});

const ListInstancesQuerySchema = z.object({
  provider: providerEnum.optional(),
  status: z
    .enum([
      "RUNNING",
      "STOPPED",
      "DEPLOYING",
      "DESTROYING",
      "DESTROYED",
      "SUSPENDED",
      "ERROR",
      "UNKNOWN",
    ])
    .optional(),
  region: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const instances = new Hono();

// Apply auth middleware to all routes
instances.use("*", authMiddleware);

// ─── POST /api/v1/instances ───────────────────────────────────────────────────

instances.post("/", rateLimitStrict, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Bad Request", message: "Request body must be valid JSON" }, 400);
  }

  // Try the standard schema first, then the Draupnir agent schema
  const parseResult = RegisterInstanceSchema.safeParse(body);
  const agentResult = !parseResult.success ? AgentRegistrationSchema.safeParse(body) : null;

  if (!parseResult.success && (!agentResult || !agentResult.success)) {
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
    // Extract remote IP for geo-detection of docker/kubernetes instances
    const remoteIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      undefined;

    let input: Parameters<typeof registerInstance>[0];

    if (parseResult.success) {
      input = { ...parseResult.data, remoteIp };
    } else {
      // Map Draupnir agent fields → RegisterInstanceInput.
      // The agent sends instance_id which is the Mimir-assigned CUID;
      // look up the instance name from the database, falling back to hostname.
      const agent = agentResult!.data!;
      let instanceName = agent.hostname ?? agent.instance_id;

      // If the instance_id looks like a CUID (Mimir-assigned), resolve the name
      const existing = await db.instance.findUnique({
        where: { id: agent.instance_id },
        select: { name: true },
      });
      if (existing) {
        instanceName = existing.name;
      }

      input = {
        name: instanceName,
        provider: agent.provider,
        region: agent.region,
        extensions: [],
        tags: agent.tags,
        remoteIp,
      };
    }

    const instance = await registerInstance(input);
    return c.json(serializeInstance(instance), 201);
  } catch (err) {
    logger.error({ err }, "Failed to register instance");
    return c.json({ error: "Internal Server Error", message: "Failed to register instance" }, 500);
  }
});

// ─── GET /api/v1/instances ────────────────────────────────────────────────────

instances.get("/", rateLimitDefault, async (c) => {
  const queryResult = ListInstancesQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!queryResult.success) {
    return c.json(
      {
        error: "Validation Error",
        message: "Invalid query parameters",
        details: queryResult.error.flatten(),
      },
      422,
    );
  }

  try {
    const auth = c.get("auth");
    const teamScope = await getVisibleInstanceFilter(auth.userId, auth.role);
    const result = await listInstances({
      ...queryResult.data,
      teamScope: teamScope as Record<string, unknown> | undefined,
    });
    return c.json({
      instances: result.instances.map(serializeInstance),
      pagination: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to list instances");
    return c.json({ error: "Internal Server Error", message: "Failed to list instances" }, 500);
  }
});

// ─── GET /api/v1/instances/:id ───────────────────────────────────────────────

instances.get("/:id", rateLimitDefault, async (c) => {
  const id = c.req.param("id")!;
  if (!id || id.length > 128) {
    return c.json({ error: "Bad Request", message: "Invalid instance ID" }, 400);
  }

  try {
    const instance = await getInstanceById(id);
    if (!instance) {
      return c.json({ error: "Not Found", message: `Instance '${id}' not found` }, 404);
    }
    return c.json(serializeInstanceDetail(instance));
  } catch (err) {
    logger.error({ err, instanceId: id }, "Failed to fetch instance");
    return c.json({ error: "Internal Server Error", message: "Failed to fetch instance" }, 500);
  }
});

// ─── DELETE /api/v1/instances/:id ────────────────────────────────────────────

instances.delete("/:id", rateLimitStrict, requireRole("OPERATOR"), async (c) => {
  const id = c.req.param("id")!;
  if (!id || id.length > 128) {
    return c.json({ error: "Bad Request", message: "Invalid instance ID" }, 400);
  }

  try {
    const instance = await deregisterInstance(id);
    if (!instance) {
      return c.json({ error: "Not Found", message: `Instance '${id}' not found` }, 404);
    }
    return c.json({ message: "Instance deregistered", id: instance.id, name: instance.name });
  } catch (err) {
    logger.error({ err, instanceId: id }, "Failed to deregister instance");
    return c.json(
      { error: "Internal Server Error", message: "Failed to deregister instance" },
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Serializers — ensure bigint fields are converted and sensitive data excluded
// ─────────────────────────────────────────────────────────────────────────────

function serializeInstance(instance: {
  id: string;
  name: string;
  provider: string;
  region: string | null;
  extensions: string[];
  config_hash: string | null;
  ssh_endpoint: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: instance.id,
    name: instance.name,
    provider: instance.provider,
    region: instance.region,
    extensions: instance.extensions,
    configHash: instance.config_hash,
    sshEndpoint: instance.ssh_endpoint,
    status: instance.status,
    createdAt: instance.created_at.toISOString(),
    updatedAt: instance.updated_at.toISOString(),
  };
}

function serializeInstanceDetail(
  instance: Parameters<typeof serializeInstance>[0] & {
    lastHeartbeat?: {
      cpu_percent: number;
      memory_used: bigint;
      memory_total: bigint;
      disk_used: bigint;
      disk_total: bigint;
      uptime: bigint;
      timestamp: Date;
    } | null;
  },
): unknown {
  const base = serializeInstance(instance);

  const heartbeat = instance.lastHeartbeat;

  return {
    ...base,
    lastHeartbeat: heartbeat
      ? {
          cpuPercent: heartbeat.cpu_percent,
          memoryUsedBytes: heartbeat.memory_used.toString(),
          memoryTotalBytes: heartbeat.memory_total.toString(),
          diskUsedBytes: heartbeat.disk_used.toString(),
          diskTotalBytes: heartbeat.disk_total.toString(),
          uptimeSeconds: heartbeat.uptime.toString(),
          timestamp: heartbeat.timestamp.toISOString(),
        }
      : null,
  };
}

export { instances as instancesRouter };
