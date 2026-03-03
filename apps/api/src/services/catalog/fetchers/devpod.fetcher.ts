/**
 * DevPod compute catalog fetcher.
 *
 * DevPod delegates to an underlying cloud provider (AWS/GCP/Azure) or
 * runs locally (SSH/local). This fetcher returns generic local tiers
 * with $0 pricing. For cloud backends, the frontend reuses the
 * corresponding cloud provider's catalog data.
 */

import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

const DEVPOD_SIZES: ComputeSize[] = [
  {
    id: "devpod-small",
    name: "Small (1 vCPU, 2 GB)",
    provider: "devpod",
    category: "cpu",
    vcpus: 1,
    memory_gb: 2,
    storage_gb: 20,
    price_per_hour: 0,
    price_per_month: 0,
    price_source: "none",
  },
  {
    id: "devpod-medium",
    name: "Medium (2 vCPU, 4 GB)",
    provider: "devpod",
    category: "cpu",
    vcpus: 2,
    memory_gb: 4,
    storage_gb: 40,
    price_per_hour: 0,
    price_per_month: 0,
    price_source: "none",
  },
  {
    id: "devpod-large",
    name: "Large (4 vCPU, 8 GB)",
    provider: "devpod",
    category: "cpu",
    vcpus: 4,
    memory_gb: 8,
    storage_gb: 80,
    price_per_hour: 0,
    price_per_month: 0,
    price_source: "none",
  },
];

export async function fetchDevPodCatalog(
  _config: CatalogFetcherConfig,
  _region?: string,
): Promise<ComputeCatalog | null> {
  return {
    provider: "devpod",
    sizes: DEVPOD_SIZES,
    storage_price_gb_month: 0,
    network_egress_gb_price: 0,
    network_egress_free_gb: 0,
    fetched_at: new Date().toISOString(),
    source: "live",
    ttl_seconds: 0,
  };
}
