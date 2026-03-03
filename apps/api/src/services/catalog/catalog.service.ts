/**
 * Compute catalog service.
 *
 * Fetches compute sizes and pricing from each provider's API, caches in Redis
 * with configurable TTLs. Returns null when APIs are unavailable.
 *
 * For providers that support regional pricing (fly, aws, gcp, azure),
 * region-specific results are cached under separate keys.
 *
 * Cache chain: Redis cache → live API fetch → null (unavailable).
 */

import { redis } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";
import { getCatalogConfig } from "./config.js";
import type { CatalogFetcherConfig, ComputeCatalog, CostEstimate } from "./types.js";
import { fetchFlyCatalog } from "./fetchers/fly.fetcher.js";
import { fetchRunPodCatalog } from "./fetchers/runpod.fetcher.js";
import { fetchNorthflankCatalog } from "./fetchers/northflank.fetcher.js";
import { fetchAwsCatalog } from "./fetchers/aws.fetcher.js";
import { fetchGcpCatalog } from "./fetchers/gcp.fetcher.js";
import { fetchAzureCatalog } from "./fetchers/azure.fetcher.js";
import { fetchE2bCatalog } from "./fetchers/e2b.fetcher.js";
import { fetchDockerCatalog } from "./fetchers/docker.fetcher.js";
import { fetchKubernetesCatalog } from "./fetchers/kubernetes.fetcher.js";
import { fetchDevPodCatalog } from "./fetchers/devpod.fetcher.js";
import { fetchDigitalOceanCatalog } from "./fetchers/digitalocean.fetcher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher registry
// ─────────────────────────────────────────────────────────────────────────────

type FetcherFn = (config: CatalogFetcherConfig, region?: string) => Promise<ComputeCatalog | null>;

const FETCHERS: Record<string, FetcherFn> = {
  fly: fetchFlyCatalog,
  runpod: fetchRunPodCatalog,
  northflank: fetchNorthflankCatalog,
  aws: fetchAwsCatalog,
  gcp: fetchGcpCatalog,
  azure: fetchAzureCatalog,
  e2b: fetchE2bCatalog,
  docker: fetchDockerCatalog,
  kubernetes: fetchKubernetesCatalog,
  devpod: fetchDevPodCatalog,
  digitalocean: fetchDigitalOceanCatalog,
};

// ─────────────────────────────────────────────────────────────────────────────
// Redis cache keys
// ─────────────────────────────────────────────────────────────────────────────

function cacheKey(provider: string, region?: string): string {
  if (region) return `catalog:${provider}:${region}`;
  return `catalog:${provider}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get catalog for a provider, serving from Redis cache if fresh.
 * For regional-pricing providers, a region-specific cache key is used.
 */
export async function getCatalog(
  provider: string,
  region?: string,
): Promise<ComputeCatalog | null> {
  const config = getCatalogConfig();
  const providerConfig = config.providers[provider];

  if (!providerConfig?.enabled) return null;

  // Determine the effective cache key based on regional pricing support
  const useRegionalKey = region && providerConfig.supports_regional_pricing;
  const key = useRegionalKey ? cacheKey(provider, region) : cacheKey(provider);

  // Try Redis cache first
  try {
    const cached = await redis.get(key);
    if (cached) {
      const catalog = JSON.parse(cached) as ComputeCatalog;
      catalog.source = "cached";
      // For non-regional providers, filter sizes by region tag if specified
      if (region && !useRegionalKey) {
        catalog.sizes = catalog.sizes.filter(
          (s) => !s.regions || s.regions.length === 0 || s.regions.includes(region),
        );
      }
      return catalog;
    }
  } catch {
    // Redis unavailable — fall through to live fetch
  }

  // Cache miss — fetch live
  return fetchAndCache(provider, providerConfig, region);
}

/**
 * Force refresh a provider's catalog (bypasses cache).
 */
export async function refreshCatalog(
  provider: string,
  region?: string,
): Promise<ComputeCatalog | null> {
  const config = getCatalogConfig();
  const providerConfig = config.providers[provider];

  if (!providerConfig?.enabled) return null;

  return fetchAndCache(provider, providerConfig, region);
}

/**
 * Refresh all enabled providers' catalogs (base/non-regional).
 */
export async function refreshAll(): Promise<Map<string, ComputeCatalog>> {
  const config = getCatalogConfig();
  const results = new Map<string, ComputeCatalog>();

  const entries = Object.entries(config.providers).filter(([, cfg]) => cfg.enabled);

  const settled = await Promise.allSettled(
    entries.map(async ([provider, cfg]) => {
      const catalog = await fetchAndCache(provider, cfg);
      return { provider, catalog };
    }),
  );

  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.catalog) {
      results.set(result.value.provider, result.value.catalog);
    } else if (result.status === "rejected") {
      logger.error({ err: result.reason }, "Failed to refresh catalog");
    }
  }

  return results;
}

/**
 * Get a cost estimate for a specific size.
 */
export async function estimateCost(
  provider: string,
  sizeId: string,
  diskGb = 20,
  egressGb = 10,
  region?: string,
): Promise<CostEstimate | null> {
  const catalog = await getCatalog(provider, region);
  if (!catalog) return null;

  const size = catalog.sizes.find((s) => s.id === sizeId);
  if (!size) return null;

  const compute = size.price_per_month;
  const storage = diskGb * catalog.storage_price_gb_month;
  const billableEgress = Math.max(0, egressGb - catalog.network_egress_free_gb);
  const network = billableEgress * catalog.network_egress_gb_price;
  const total = compute + storage + network;

  return {
    compute: Math.round(compute * 100) / 100,
    storage: Math.round(storage * 100) / 100,
    network: Math.round(network * 100) / 100,
    total: Math.round(total * 100) / 100,
    currency: "USD",
  };
}

/**
 * List all supported provider IDs that have enabled catalogs.
 */
export function getEnabledProviders(): string[] {
  const config = getCatalogConfig();
  return Object.entries(config.providers)
    .filter(([, cfg]) => cfg.enabled)
    .map(([id]) => id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAndCache(
  provider: string,
  providerConfig: CatalogFetcherConfig,
  region?: string,
): Promise<ComputeCatalog | null> {
  const fetcher = FETCHERS[provider];
  if (!fetcher) {
    logger.warn({ provider }, "No catalog fetcher registered for provider");
    return null;
  }

  // Pass region to fetcher only if provider supports regional pricing
  const effectiveRegion = providerConfig.supports_regional_pricing ? region : undefined;

  try {
    const catalog = await fetcher(providerConfig, effectiveRegion);
    if (!catalog) {
      logger.warn({ provider, region }, "Catalog fetcher returned no data");
      return null;
    }

    // Cache in Redis (if TTL > 0)
    if (providerConfig.ttl_seconds > 0) {
      const key = effectiveRegion ? cacheKey(provider, effectiveRegion) : cacheKey(provider);

      try {
        await redis.set(key, JSON.stringify(catalog), "EX", providerConfig.ttl_seconds);
      } catch {
        logger.warn({ provider }, "Failed to cache catalog in Redis");
      }
    }

    // For non-regional providers, filter by region tag if specified
    if (region && !effectiveRegion) {
      catalog.sizes = catalog.sizes.filter(
        (s) => !s.regions || s.regions.length === 0 || s.regions.includes(region),
      );
    }

    return catalog;
  } catch (err) {
    logger.error({ err, provider }, "Catalog fetch failed");
    return null;
  }
}
