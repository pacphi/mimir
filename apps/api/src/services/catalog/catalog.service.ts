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
import { resolveProviderKey } from "../../lib/credential-resolver.js";
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

/** Track in-flight background fetches to avoid duplicates. */
const inFlightFetches = new Set<string>();

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
 * Read catalog from Redis cache only — never triggers a live fetch.
 * Used by API routes so user requests are never blocked on slow provider APIs.
 */
export async function getCatalogFromCache(
  provider: string,
  region?: string,
): Promise<ComputeCatalog | null> {
  const config = getCatalogConfig();
  const providerConfig = config.providers[provider];

  if (!providerConfig?.enabled) return null;

  const useRegionalKey = region && providerConfig.supports_regional_pricing;
  const key = useRegionalKey ? cacheKey(provider, region) : cacheKey(provider);

  try {
    const cached = await redis.get(key);
    if (cached) {
      const catalog = JSON.parse(cached) as ComputeCatalog;
      catalog.source = "cached";
      if (region && !useRegionalKey) {
        catalog.sizes = catalog.sizes.filter(
          (s) => !s.regions || s.regions.length === 0 || s.regions.includes(region),
        );
      }
      return catalog;
    }
  } catch {
    // Redis unavailable
  }

  return null;
}

/**
 * Trigger a background fetch for a provider + region, caching the result.
 * Fire-and-forget — does not block the caller.
 */
export function triggerBackgroundFetch(provider: string, region?: string): void {
  const config = getCatalogConfig();
  const providerConfig = config.providers[provider];
  if (!providerConfig?.enabled) return;

  // Don't duplicate in-flight fetches
  const key = region ? `${provider}:${region}` : provider;
  if (inFlightFetches.has(key)) return;

  inFlightFetches.add(key);
  fetchAndCache(provider, providerConfig, region)
    .then((catalog) => {
      if (catalog) {
        logger.info({ provider, region }, "Background catalog fetch complete");
      }
    })
    .catch((err) => {
      logger.error({ err, provider, region }, "Background catalog fetch failed");
    })
    .finally(() => {
      inFlightFetches.delete(key);
    });
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
 * Refresh a provider's catalog across all configured regions.
 * Fetches with limited concurrency to balance speed vs resource usage.
 */
export async function refreshProviderRegions(
  provider: string,
  regionIds: string[],
  concurrency = 2,
): Promise<number> {
  const config = getCatalogConfig();
  const providerConfig = config.providers[provider];
  if (!providerConfig?.enabled || !providerConfig.supports_regional_pricing) return 0;

  let cached = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < regionIds.length; i += concurrency) {
    const batch = regionIds.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (region) => {
        const catalog = await fetchAndCache(provider, providerConfig, region);
        return { region, ok: !!catalog };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        cached++;
      } else if (result.status === "rejected") {
        logger.error({ err: result.reason, provider }, "Failed to refresh regional catalog");
      }
    }
  }

  return cached;
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

/**
 * Check which providers have pricing credentials configured.
 * Returns a map of provider ID → { available, reason }.
 * Providers that don't need API keys (docker, kubernetes, devpod) are always available.
 */
export async function checkProviderAvailability(): Promise<
  Record<string, { available: boolean; reason?: string }>
> {
  const config = getCatalogConfig();
  const result: Record<string, { available: boolean; reason?: string }> = {};

  for (const [providerId, cfg] of Object.entries(config.providers)) {
    if (!cfg.enabled) {
      result[providerId] = { available: false, reason: "Provider is disabled" };
      continue;
    }

    // Providers with no API key requirement are always available
    if (!cfg.api_key_env) {
      result[providerId] = { available: true };
      continue;
    }

    // Check if credentials are configured
    const key = await resolveProviderKey(cfg.api_key_env);
    if (!key) {
      result[providerId] = {
        available: false,
        reason: `Pricing credentials not configured (${cfg.api_key_env})`,
      };
      continue;
    }

    // For AWS, also check secret key
    if (cfg.secret_key_env) {
      const secret = await resolveProviderKey(cfg.secret_key_env);
      if (!secret) {
        result[providerId] = {
          available: false,
          reason: `Pricing credentials not configured (${cfg.secret_key_env})`,
        };
        continue;
      }
    }

    result[providerId] = { available: true };
  }

  return result;
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
