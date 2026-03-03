/**
 * RunPod compute catalog fetcher.
 *
 * Uses the RunPod GraphQL API to fetch GPU types and pricing.
 * Region parameter accepted but not used (pricing is global).
 * Returns null if the API is unavailable.
 */

import { logger } from "../../../lib/logger.js";
import { resolveProviderKey } from "../../../lib/credential-resolver.js";
import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

const RUNPOD_GRAPHQL_URL = "https://api.runpod.io/graphql";

const GPU_TYPES_QUERY = `
  query {
    gpuTypes {
      id
      displayName
      memoryInGb
      securePrice
      communityPrice
      lowestPrice(input: { gpuCount: 1 }) {
        stockStatus
        uninterruptablePrice
      }
    }
  }
`;

interface RunPodGpuType {
  id: string;
  displayName: string;
  memoryInGb: number;
  securePrice: number | null;
  communityPrice: number | null;
  lowestPrice: {
    stockStatus: string;
    uninterruptablePrice: number | null;
  } | null;
}

function stockToAvailability(status: string): "high" | "low" | "none" {
  switch (status?.toLowerCase()) {
    case "high":
      return "high";
    case "medium":
    case "low":
      return "low";
    default:
      return "none";
  }
}

function mapGpuToComputeSize(gpu: RunPodGpuType): ComputeSize | null {
  const pricePerHour = gpu.securePrice ?? gpu.communityPrice ?? 0;
  if (pricePerHour === 0 && !gpu.communityPrice) return null;

  return {
    id: gpu.id,
    name: gpu.displayName,
    provider: "runpod",
    category: "gpu",
    vcpus: 0,
    memory_gb: 0,
    storage_gb: 0,
    gpu_name: gpu.displayName,
    gpu_count: 1,
    gpu_memory_gb: gpu.memoryInGb,
    price_per_hour: pricePerHour,
    price_per_month: pricePerHour * 730,
    price_source: "api",
    availability: gpu.lowestPrice ? stockToAvailability(gpu.lowestPrice.stockStatus) : undefined,
  };
}

export async function fetchRunPodCatalog(
  config: CatalogFetcherConfig,
  _region?: string,
): Promise<ComputeCatalog | null> {
  const apiKey = config.api_key_env ? await resolveProviderKey(config.api_key_env) : undefined;
  if (!apiKey) {
    logger.warn("No PRICING_RUNPOD_API_KEY configured — RunPod catalog unavailable");
    return null;
  }

  try {
    const res = await fetch(RUNPOD_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: GPU_TYPES_QUERY }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "RunPod API returned non-OK");
      return null;
    }

    const body = (await res.json()) as {
      data?: { gpuTypes?: RunPodGpuType[] };
    };

    const gpuTypes = body.data?.gpuTypes;
    if (!gpuTypes || gpuTypes.length === 0) {
      logger.warn("RunPod API returned no GPU types");
      return null;
    }

    const sizes = gpuTypes.map(mapGpuToComputeSize).filter((s): s is ComputeSize => s !== null);

    if (sizes.length === 0) {
      logger.warn("RunPod API returned no usable GPU types");
      return null;
    }

    return {
      provider: "runpod",
      sizes,
      storage_price_gb_month: 0.1,
      network_egress_gb_price: 0.05,
      network_egress_free_gb: 0,
      fetched_at: new Date().toISOString(),
      source: "live",
      ttl_seconds: config.ttl_seconds,
    };
  } catch (err) {
    logger.error({ err }, "Failed to fetch RunPod catalog");
    return null;
  }
}
