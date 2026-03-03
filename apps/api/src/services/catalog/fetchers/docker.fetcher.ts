/**
 * Docker compute catalog fetcher.
 *
 * Docker runs locally — no API call needed. Returns static resource tiers
 * with $0 pricing by default. Maintainers can configure custom per-hour
 * costs via CATALOG_DOCKER_*_PRICE_HR env vars.
 */

import { cpus, totalmem } from "os";
import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

interface DockerTier {
  id: string;
  name: string;
  vcpus: number;
  memory_gb: number;
  storage_gb: number;
  price_env: string;
}

const TIERS: DockerTier[] = [
  {
    id: "docker-small",
    name: "Small",
    vcpus: 1,
    memory_gb: 1,
    storage_gb: 10,
    price_env: "CATALOG_DOCKER_SMALL_PRICE_HR",
  },
  {
    id: "docker-medium",
    name: "Medium",
    vcpus: 2,
    memory_gb: 4,
    storage_gb: 20,
    price_env: "CATALOG_DOCKER_MEDIUM_PRICE_HR",
  },
  {
    id: "docker-large",
    name: "Large",
    vcpus: 4,
    memory_gb: 8,
    storage_gb: 40,
    price_env: "CATALOG_DOCKER_LARGE_PRICE_HR",
  },
  {
    id: "docker-xlarge",
    name: "XLarge",
    vcpus: 8,
    memory_gb: 16,
    storage_gb: 80,
    price_env: "CATALOG_DOCKER_XLARGE_PRICE_HR",
  },
];

function getCustomPrice(envVar: string): number {
  const val = process.env[envVar];
  if (!val) return 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

export async function fetchDockerCatalog(
  _config: CatalogFetcherConfig,
  _region?: string,
): Promise<ComputeCatalog | null> {
  const hostCpus = cpus().length;
  const hostMemGb = Math.round(totalmem() / 1024 ** 3);

  const sizes: ComputeSize[] = TIERS.filter(
    (t) => t.vcpus <= hostCpus && t.memory_gb <= hostMemGb,
  ).map((t) => {
    const priceHr = getCustomPrice(t.price_env);
    return {
      id: t.id,
      name: `${t.name} (${t.vcpus} vCPU, ${t.memory_gb} GB)`,
      provider: "docker",
      category: "cpu" as const,
      vcpus: t.vcpus,
      memory_gb: t.memory_gb,
      storage_gb: t.storage_gb,
      price_per_hour: priceHr,
      price_per_month: Math.round(priceHr * 730 * 100) / 100,
      price_source: priceHr > 0 ? ("static" as const) : ("none" as const),
    };
  });

  // Always include at least one size even if host is tiny
  if (sizes.length === 0) {
    sizes.push({
      id: "docker-small",
      name: "Small (1 vCPU, 1 GB)",
      provider: "docker",
      category: "cpu",
      vcpus: 1,
      memory_gb: 1,
      storage_gb: 10,
      price_per_hour: 0,
      price_per_month: 0,
      price_source: "none",
    });
  }

  return {
    provider: "docker",
    sizes,
    storage_price_gb_month: 0,
    network_egress_gb_price: 0,
    network_egress_free_gb: 0,
    fetched_at: new Date().toISOString(),
    source: "live",
    ttl_seconds: 0,
  };
}
