/**
 * Instance service — business logic for the instance registry.
 *
 * Wraps Prisma queries and emits Redis events so the WebSocket layer can push
 * real-time updates to connected browser clients.
 */

import type { Instance, InstanceStatus, Prisma } from "@prisma/client";
import { db } from "../lib/db.js";
import { redis, REDIS_CHANNELS } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { resolveInstanceGeo } from "./geo/geo-resolver.js";

// ─────────────────────────────────────────────────────────────────────────────
// Input types (validated by Zod in the route layer)
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterInstanceInput {
  name: string;
  provider: string;
  region?: string;
  extensions: string[];
  configHash?: string;
  sshEndpoint?: string;
  tags?: Record<string, string>;
  geo?: {
    lat?: number;
    lon?: number;
    city?: string;
    source?: string;
  };
  remoteIp?: string;
}

export interface ListInstancesFilter {
  provider?: string;
  status?: InstanceStatus;
  region?: string;
  page?: number;
  pageSize?: number;
  /** Team scope filter — injected by route layer for non-admin users */
  teamScope?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a new instance or update an existing active one by name.
 * If there is an active (non-DESTROYED/ERROR) instance with the same name,
 * update it. Otherwise create a new record (preserving historical ones).
 */
export async function registerInstance(input: RegisterInstanceInput): Promise<Instance> {
  // Resolve geo coordinates via multi-fallback chain
  const geoResult = await resolveInstanceGeo({
    provider: input.provider,
    region: input.region,
    tags: input.tags,
    geo: input.geo,
    remoteIp: input.remoteIp,
  });

  const geoFields = geoResult
    ? {
        geo_lat: geoResult.lat,
        geo_lon: geoResult.lon,
        geo_label: geoResult.label,
        geo_source: geoResult.source,
      }
    : {};

  // Find the active instance with this name (if any)
  const existing = await db.instance.findFirst({
    where: {
      name: input.name,
      status: { notIn: ["DESTROYED", "ERROR"] },
    },
  });

  const instanceData = {
    provider: input.provider,
    region: input.region ?? null,
    extensions: input.extensions,
    config_hash: input.configHash ?? null,
    ssh_endpoint: input.sshEndpoint ?? null,
    status: "RUNNING" as const,
    ...geoFields,
  };

  const instance = existing
    ? await db.instance.update({
        where: { id: existing.id },
        data: { ...instanceData, updated_at: new Date() },
      })
    : await db.instance.create({
        data: { name: input.name, ...instanceData },
      });

  // Record DEPLOY event
  await db.event.create({
    data: {
      instance_id: instance.id,
      event_type: "DEPLOY",
      metadata: { triggered_by: "api", provider: input.provider },
    },
  });

  // Publish to Redis for real-time subscribers
  publishInstanceEvent(instance.id, "deploy", { name: instance.name, provider: instance.provider });

  // Invalidate fleet geo cache and notify WebSocket subscribers
  redis.del("sindri:cache:fleet:geo").catch(() => {});
  if (geoResult) {
    redis
      .publish("sindri:fleet:geo_update", JSON.stringify({ instanceId: instance.id, ...geoResult }))
      .catch(() => {});
  }

  logger.info(
    { instanceId: instance.id, name: instance.name, provider: input.provider },
    "Instance registered",
  );
  return instance;
}

/**
 * List instances with optional filters and pagination.
 */
export async function listInstances(filter: ListInstancesFilter = {}): Promise<{
  instances: Instance[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.InstanceWhereInput = {
    ...(filter.teamScope as Prisma.InstanceWhereInput | undefined),
  };
  if (filter.provider) where.provider = filter.provider;
  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.region) where.region = filter.region;

  const [instances, total] = await Promise.all([
    db.instance.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { created_at: "desc" },
    }),
    db.instance.count({ where }),
  ]);

  return {
    instances,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get a single instance by ID, with its most recent heartbeat.
 */
export async function getInstanceById(id: string): Promise<
  | (Instance & {
      lastHeartbeat: {
        cpu_percent: number;
        memory_used: bigint;
        memory_total: bigint;
        disk_used: bigint;
        disk_total: bigint;
        uptime: bigint;
        timestamp: Date;
      } | null;
    })
  | null
> {
  const instance = await db.instance.findUnique({ where: { id } });
  if (!instance) return null;

  const lastHeartbeat = await db.heartbeat.findFirst({
    where: { instance_id: id },
    orderBy: { timestamp: "desc" },
    select: {
      cpu_percent: true,
      memory_used: true,
      memory_total: true,
      disk_used: true,
      disk_total: true,
      uptime: true,
      timestamp: true,
    },
  });

  return { ...instance, lastHeartbeat: lastHeartbeat ?? null };
}

/**
 * Deregister (soft-delete) an instance via the lifecycle service.
 * Uses skipInfraTeardown since the agent is self-deregistering (infra may still exist).
 * Sets status to STOPPED, preserving the record for audit purposes.
 */
export async function deregisterInstance(id: string): Promise<Instance | null> {
  const { destroyInstance } = await import("./lifecycle.js");
  try {
    const result = await destroyInstance(id, { backupVolume: false, skipInfraTeardown: true });
    return result?.instance ?? null;
  } catch {
    // If the instance is in a non-destroyable state, return null
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

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
      logger.warn({ err, instanceId, eventType }, "Failed to publish instance event to Redis"),
    );
}
