/**
 * Fly.io compute catalog fetcher.
 *
 * Uses the Fly GraphQL API to fetch VM sizes and pricing.
 * Applies regional price multipliers when a region is specified.
 * Returns null if the API is unavailable.
 */

import { logger } from "../../../lib/logger.js";
import { resolveProviderKey } from "../../../lib/credential-resolver.js";
import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

const FLY_GRAPHQL_URL = "https://api.fly.io/graphql";

const VM_SIZES_QUERY = `
  query {
    platform {
      vmSizes {
        name
        cpuCores
        memoryGb
        priceMonth
        priceSecond
      }
    }
  }
`;

interface FlyVmSize {
  name: string;
  cpuCores: number;
  memoryGb: number;
  priceMonth: number;
  priceSecond: number;
}

/**
 * Regional price multipliers relative to iad (Ashburn) = 1.0.
 * Source: https://fly.io/docs/about/pricing/ — embedded JS pricing widget.
 */
const FLY_REGION_MULTIPLIERS: Record<string, number> = {
  iad: 1.0,
  ewr: 1.0,
  ams: 1.038461538,
  arn: 1.038461538,
  bom: 1.076923077,
  yyz: 1.115384615,
  cdg: 1.134615385,
  lhr: 1.134615385,
  fra: 1.153846154,
  sjc: 1.192307692,
  lax: 1.199519231,
  ord: 1.25,
  dfw: 1.25,
  sin: 1.269230769,
  syd: 1.269230769,
  jnb: 1.302884615,
  nrt: 1.307692308,
  gru: 1.615384615,
};

/**
 * Map Fly API VM names to official display names.
 * The API returns "dedicated-cpu-Nx" but Fly's pricing page calls these "Performance Nx".
 */
function displayName(apiName: string): string {
  // dedicated-cpu-1x → Performance 1x, dedicated-cpu-2x → Performance 2x, etc.
  const dedicatedMatch = apiName.match(/^dedicated-cpu-(\d+x)$/);
  if (dedicatedMatch) return `Performance ${dedicatedMatch[1]}`;

  // shared-cpu-1x → Shared CPU 1x
  const sharedMatch = apiName.match(/^shared-cpu-(\d+x)$/);
  if (sharedMatch) return `Shared CPU ${sharedMatch[1]}`;

  // Fallback: title-case
  return apiName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapToComputeSize(vm: FlyVmSize, region?: string): ComputeSize {
  const multiplier = region ? (FLY_REGION_MULTIPLIERS[region] ?? 1.0) : 1.0;
  const pricePerHour = vm.priceSecond * 3600 * multiplier;
  const pricePerMonth = vm.priceMonth * multiplier;

  return {
    id: vm.name,
    name: displayName(vm.name),
    provider: "fly",
    category: "cpu",
    vcpus: vm.cpuCores,
    memory_gb: vm.memoryGb,
    storage_gb: 0,
    price_per_hour: Math.round(pricePerHour * 10000) / 10000,
    price_per_month: Math.round(pricePerMonth * 100) / 100,
    price_source: "api",
    ...(region ? { regions: [region] } : {}),
  };
}

export async function fetchFlyCatalog(
  config: CatalogFetcherConfig,
  region?: string,
): Promise<ComputeCatalog | null> {
  const token = config.api_key_env ? await resolveProviderKey(config.api_key_env) : undefined;
  if (!token) {
    logger.warn("No PRICING_FLY_API_TOKEN configured — Fly.io catalog unavailable");
    return null;
  }

  try {
    const res = await fetch(FLY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: VM_SIZES_QUERY }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "Fly.io API returned non-OK");
      return null;
    }

    const body = (await res.json()) as {
      data?: { platform?: { vmSizes?: FlyVmSize[] } };
    };

    const vmSizes = body.data?.platform?.vmSizes;
    if (!vmSizes || vmSizes.length === 0) {
      logger.warn("Fly.io API returned no VM sizes");
      return null;
    }

    return {
      provider: "fly",
      sizes: vmSizes.map((vm) => mapToComputeSize(vm, region)),
      storage_price_gb_month: 0.15,
      network_egress_gb_price: 0.02,
      network_egress_free_gb: 100,
      fetched_at: new Date().toISOString(),
      source: "live",
      ttl_seconds: config.ttl_seconds,
    };
  } catch (err) {
    logger.error({ err }, "Failed to fetch Fly.io catalog");
    return null;
  }
}
