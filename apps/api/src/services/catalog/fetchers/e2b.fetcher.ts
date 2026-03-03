/**
 * E2B compute catalog fetcher.
 *
 * E2B has no pricing API — pricing is formula-based:
 *   $0.000014/vCPU/sec + $0.0000045/GB/sec
 * Which equals: $0.0504/vCPU/hr + $0.0162/GB/hr
 */

import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

const CPU_PER_HOUR = 0.0504;
const MEM_PER_GB_HOUR = 0.0162;

const E2B_SIZES: Array<{ id: string; name: string; vcpus: number; memory_gb: number }> = [
  { id: "e2b-1c-512m", name: "1 vCPU / 512 MB", vcpus: 1, memory_gb: 0.5 },
  { id: "e2b-2c-1g", name: "2 vCPU / 1 GB", vcpus: 2, memory_gb: 1 },
  { id: "e2b-2c-2g", name: "2 vCPU / 2 GB", vcpus: 2, memory_gb: 2 },
  { id: "e2b-4c-4g", name: "4 vCPU / 4 GB", vcpus: 4, memory_gb: 4 },
  { id: "e2b-8c-8g", name: "8 vCPU / 8 GB", vcpus: 8, memory_gb: 8 },
];

function computePrice(vcpus: number, memGb: number): { hourly: number; monthly: number } {
  const hourly = vcpus * CPU_PER_HOUR + memGb * MEM_PER_GB_HOUR;
  return {
    hourly: Math.round(hourly * 10000) / 10000,
    monthly: Math.round(hourly * 730 * 100) / 100,
  };
}

export async function fetchE2bCatalog(
  config: CatalogFetcherConfig,
  _region?: string,
): Promise<ComputeCatalog | null> {
  const sizes: ComputeSize[] = E2B_SIZES.map((s) => {
    const price = computePrice(s.vcpus, s.memory_gb);
    return {
      id: s.id,
      name: s.name,
      provider: "e2b",
      category: "cpu" as const,
      vcpus: s.vcpus,
      memory_gb: s.memory_gb,
      storage_gb: 0,
      price_per_hour: price.hourly,
      price_per_month: price.monthly,
      price_source: "formula" as const,
    };
  });

  return {
    provider: "e2b",
    sizes,
    storage_price_gb_month: 0,
    network_egress_gb_price: 0,
    network_egress_free_gb: 0,
    fetched_at: new Date().toISOString(),
    source: "live",
    ttl_seconds: config.ttl_seconds || 86400,
  };
}
