/**
 * DigitalOcean compute catalog fetcher.
 *
 * Uses the DigitalOcean v2 Sizes API to fetch all available droplet sizes
 * with live pricing. Requires PRICING_DIGITALOCEAN_TOKEN (personal access token or OAuth).
 *
 * API reference: https://docs.digitalocean.com/reference/api/api-reference/#operation/sizes_list
 *
 * Default size `s-4vcpu-8gb` matches Sindri v3's DigitalOceanConfig default.
 */

import { logger } from "../../../lib/logger.js";
import { resolveProviderKey } from "../../../lib/credential-resolver.js";
import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

const DO_SIZES_URL = "https://api.digitalocean.com/v2/sizes";

interface DoSize {
  slug: string;
  memory: number; // MB
  vcpus: number;
  disk: number; // GB
  price_monthly: number; // USD
  price_hourly: number; // USD
  regions: string[];
  available: boolean;
  description: string;
}

function mapToComputeSize(size: DoSize): ComputeSize {
  return {
    id: size.slug,
    name: `${size.description} (${size.vcpus} vCPU, ${size.memory / 1024} GB)`,
    provider: "digitalocean",
    category: "cpu",
    vcpus: size.vcpus,
    memory_gb: size.memory / 1024,
    storage_gb: size.disk,
    price_per_hour: size.price_hourly,
    price_per_month: size.price_monthly,
    price_source: "api",
    availability: size.available ? "high" : "none",
    regions: size.regions,
  };
}

/** Slugs to include — standard and cpu-optimized droplets relevant to Sindri workloads. */
const SLUG_ALLOWLIST = new Set([
  "s-1vcpu-2gb",
  "s-2vcpu-4gb",
  "s-4vcpu-8gb",
  "s-8vcpu-16gb",
  "c-2",
  "c-4",
  "c-8",
  "m-2vcpu-16gb",
  "m-4vcpu-32gb",
]);

export async function fetchDigitalOceanCatalog(
  config: CatalogFetcherConfig,
  _region?: string,
): Promise<ComputeCatalog | null> {
  const token = config.api_key_env ? await resolveProviderKey(config.api_key_env) : undefined;
  if (!token) {
    logger.warn("No PRICING_DIGITALOCEAN_TOKEN configured — DigitalOcean catalog unavailable");
    return null;
  }

  try {
    const res = await fetch(DO_SIZES_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "DigitalOcean API returned non-OK");
      return null;
    }

    const body = (await res.json()) as { sizes?: DoSize[] };
    const sizes = body.sizes;

    if (!sizes || sizes.length === 0) {
      logger.warn("DigitalOcean API returned no sizes");
      return null;
    }

    const filtered = sizes
      .filter((s) => SLUG_ALLOWLIST.has(s.slug))
      .map(mapToComputeSize)
      .sort((a, b) => a.price_per_hour - b.price_per_hour);

    if (filtered.length === 0) {
      logger.warn("DigitalOcean API returned no matching sizes after filtering");
      return null;
    }

    return {
      provider: "digitalocean",
      sizes: filtered,
      storage_price_gb_month: 0.1,
      network_egress_gb_price: 0.01,
      network_egress_free_gb: 1000,
      fetched_at: new Date().toISOString(),
      source: "live",
      ttl_seconds: config.ttl_seconds,
    };
  } catch (err) {
    logger.error({ err }, "Failed to fetch DigitalOcean catalog");
    return null;
  }
}
