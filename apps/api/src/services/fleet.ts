/**
 * Fleet service — aggregate statistics and geo data for the fleet overview dashboard.
 */

import { db } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { resolveRegionCoords } from "./geo/region-coords.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fleet stats — shape matches FleetStats in apps/web/src/types/fleet.ts
// ─────────────────────────────────────────────────────────────────────────────

export interface FleetStats {
  total: number;
  by_status: Record<string, number>;
  by_provider: { provider: string; count: number }[];
  active_sessions: number;
  updated_at: string;
}

export async function getFleetStats(): Promise<FleetStats> {
  const [statusCounts, providerCounts, sessionCount] = await Promise.all([
    db.instance.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
    db.instance.groupBy({
      by: ["provider"],
      _count: { provider: true },
    }),
    db.terminalSession.count({ where: { status: "ACTIVE" } }),
  ]);

  const byStatus = Object.fromEntries(
    statusCounts.map((r: { status: string; _count: { status: number } }) => [
      r.status,
      r._count.status,
    ]),
  );

  type StatusRow = { status: string; _count: { status: number } };
  type ProviderRow = { provider: string; _count: { provider: number } };

  return {
    total: (statusCounts as StatusRow[]).reduce(
      (sum: number, r: StatusRow) => sum + r._count.status,
      0,
    ),
    by_status: byStatus,
    by_provider: (providerCounts as ProviderRow[]).map((r: ProviderRow) => ({
      provider: r.provider,
      count: r._count.provider,
    })),
    active_sessions: sessionCount,
    updated_at: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fleet geo
// ─────────────────────────────────────────────────────────────────────────────

export interface GeoPin {
  region: string;
  lat: number;
  lon: number;
  label: string;
  count: number;
  statuses: Record<string, number>;
  provider: string;
}

const GEO_CACHE_KEY = "sindri:cache:fleet:geo";
const GEO_CACHE_TTL = 10; // seconds

export async function getFleetGeo(): Promise<GeoPin[]> {
  // Check Redis cache
  try {
    const cached = await redis.get(GEO_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as GeoPin[];
    }
  } catch {
    // Cache miss, continue
  }

  const instances = await db.instance.findMany({
    select: {
      id: true,
      region: true,
      status: true,
      provider: true,
      geo_lat: true,
      geo_lon: true,
      geo_label: true,
    },
  });

  // Group by rounded (lat, lon) to 2 decimal places for co-located clustering
  const pinMap = new Map<string, GeoPin>();

  for (const inst of instances) {
    let lat = inst.geo_lat;
    let lon = inst.geo_lon;
    let label = inst.geo_label;

    // Fallback to region registry for instances not yet backfilled
    if (lat == null || lon == null) {
      const coords = resolveRegionCoords(inst.region, inst.provider);
      if (!coords) continue;
      lat = coords.lat;
      lon = coords.lon;
      label = coords.label;
    }

    // Round to 2 decimal places for grouping co-located instances
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const groupKey = `${roundedLat}:${roundedLon}`;

    if (!pinMap.has(groupKey)) {
      pinMap.set(groupKey, {
        region: inst.region ?? `${inst.provider}-local`,
        lat: roundedLat,
        lon: roundedLon,
        label: label ?? `${roundedLat}, ${roundedLon}`,
        count: 0,
        statuses: {},
        provider: inst.provider,
      });
    }

    const pin = pinMap.get(groupKey)!;
    pin.count += 1;
    pin.statuses[inst.status] = (pin.statuses[inst.status] ?? 0) + 1;
  }

  const pins = Array.from(pinMap.values());

  // Cache result
  try {
    await redis.set(GEO_CACHE_KEY, JSON.stringify(pins), "EX", GEO_CACHE_TTL);
  } catch {
    // Non-critical
  }

  return pins;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fleet deployments — shape matches FleetDeploymentsResponse in frontend types
// ─────────────────────────────────────────────────────────────────────────────

export interface DeploymentActivity {
  hour: string; // ISO timestamp rounded to the hour
  deployments: number;
  failures: number;
}

export interface FleetDeploymentsResponse {
  activity: DeploymentActivity[];
  total_24h: number;
  success_rate: number;
}

export async function getFleetDeployments(): Promise<FleetDeploymentsResponse> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const deployments = await db.deployment.findMany({
    where: { started_at: { gte: since } },
    select: { started_at: true, status: true },
    orderBy: { started_at: "asc" },
  });

  // Build 24 hourly buckets
  const buckets = new Map<string, DeploymentActivity>();
  const now = new Date();

  for (let h = 23; h >= 0; h--) {
    const d = new Date(now);
    d.setHours(d.getHours() - h, 0, 0, 0);
    const key = d.toISOString().slice(0, 13) + ":00:00.000Z";
    buckets.set(key, { hour: key, deployments: 0, failures: 0 });
  }

  let totalSucceeded = 0;
  let _totalFailed = 0;

  for (const dep of deployments) {
    const key = dep.started_at.toISOString().slice(0, 13) + ":00:00.000Z";
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.deployments += 1;
    if (dep.status === "FAILED") {
      bucket.failures += 1;
      _totalFailed += 1;
    } else if (dep.status === "SUCCEEDED") {
      totalSucceeded += 1;
    }
  }

  const total = deployments.length;
  const successRate = total > 0 ? Math.round((totalSucceeded / total) * 100) : 100;

  return {
    activity: Array.from(buckets.values()),
    total_24h: total,
    success_rate: successRate,
  };
}
