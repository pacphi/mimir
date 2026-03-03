/**
 * Kubernetes compute catalog fetcher.
 *
 * Kubernetes has no universal pricing — cost depends on the cluster's
 * underlying infrastructure. Returns static pod resource request tiers
 * with $0 pricing by default; maintainers can set custom per-hour costs.
 */

import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

interface K8sTier {
  id: string;
  name: string;
  vcpus: number;
  memory_gb: number;
  storage_gb: number;
  price_env: string;
}

const TIERS: K8sTier[] = [
  {
    id: "k8s-small",
    name: "Small Pod",
    vcpus: 0.5,
    memory_gb: 0.5,
    storage_gb: 5,
    price_env: "CATALOG_K8S_SMALL_PRICE_HR",
  },
  {
    id: "k8s-medium",
    name: "Medium Pod",
    vcpus: 1,
    memory_gb: 2,
    storage_gb: 10,
    price_env: "CATALOG_K8S_MEDIUM_PRICE_HR",
  },
  {
    id: "k8s-large",
    name: "Large Pod",
    vcpus: 2,
    memory_gb: 4,
    storage_gb: 20,
    price_env: "CATALOG_K8S_LARGE_PRICE_HR",
  },
  {
    id: "k8s-xlarge",
    name: "XLarge Pod",
    vcpus: 4,
    memory_gb: 8,
    storage_gb: 50,
    price_env: "CATALOG_K8S_XLARGE_PRICE_HR",
  },
];

function getCustomPrice(envVar: string): number {
  const val = process.env[envVar];
  if (!val) return 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

export async function fetchKubernetesCatalog(
  _config: CatalogFetcherConfig,
  _region?: string,
): Promise<ComputeCatalog | null> {
  const sizes: ComputeSize[] = TIERS.map((t) => {
    const priceHr = getCustomPrice(t.price_env);
    return {
      id: t.id,
      name: `${t.name} (${t.vcpus} vCPU, ${t.memory_gb} GB)`,
      provider: "kubernetes",
      category: "cpu" as const,
      vcpus: t.vcpus,
      memory_gb: t.memory_gb,
      storage_gb: t.storage_gb,
      price_per_hour: priceHr,
      price_per_month: Math.round(priceHr * 730 * 100) / 100,
      price_source: priceHr > 0 ? ("static" as const) : ("none" as const),
    };
  });

  return {
    provider: "kubernetes",
    sizes,
    storage_price_gb_month: 0,
    network_egress_gb_price: 0,
    network_egress_free_gb: 0,
    fetched_at: new Date().toISOString(),
    source: "live",
    ttl_seconds: 0,
  };
}
