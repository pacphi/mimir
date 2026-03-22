/**
 * Northflank compute catalog fetcher.
 *
 * Uses the Northflank REST API to fetch available plans and pricing.
 * Region parameter accepted but not used (pricing is global).
 * Returns null if the API is unavailable.
 */

import { logger } from "../../../lib/logger.js";
import { resolveProviderKey } from "../../../lib/credential-resolver.js";
import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

const NORTHFLANK_API_URL = "https://api.northflank.com/v1/plans";

interface NorthflankPlan {
  id: string;
  name: string;
  cpu: number; // millicores
  memory: number; // MB
  storage: number; // MB
  priceMonthly: number;
  priceHourly: number;
}

function mapToComputeSize(plan: NorthflankPlan): ComputeSize {
  return {
    id: plan.id,
    name: plan.name,
    provider: "northflank",
    category: "cpu",
    vcpus: plan.cpu / 1000,
    memory_gb: plan.memory / 1024,
    storage_gb: plan.storage / 1024,
    price_per_hour: plan.priceHourly ?? 0,
    price_per_month: plan.priceMonthly ?? 0,
    price_source: "api",
  };
}

export async function fetchNorthflankCatalog(
  config: CatalogFetcherConfig,
  _region?: string,
): Promise<ComputeCatalog | null> {
  const token = config.api_key_env ? await resolveProviderKey(config.api_key_env) : undefined;
  if (!token) {
    logger.warn("No PRICING_NORTHFLANK_API_TOKEN configured — Northflank catalog unavailable");
    return null;
  }

  try {
    const res = await fetch(NORTHFLANK_API_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "Northflank API returned non-OK");
      return null;
    }

    const body = (await res.json()) as { data?: { plans?: NorthflankPlan[] } };
    const plans = body.data?.plans;

    if (!plans || plans.length === 0) {
      logger.warn("Northflank API returned no plans");
      return null;
    }

    return {
      provider: "northflank",
      sizes: plans.map(mapToComputeSize),
      storage_price_gb_month: 0.25,
      network_egress_gb_price: 0.03,
      network_egress_free_gb: 100,
      fetched_at: new Date().toISOString(),
      source: "live",
      ttl_seconds: config.ttl_seconds,
    };
  } catch (err) {
    logger.error({ err }, "Failed to fetch Northflank catalog");
    return null;
  }
}
