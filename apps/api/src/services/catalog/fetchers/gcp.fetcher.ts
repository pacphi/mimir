/**
 * GCP compute catalog fetcher.
 *
 * Uses the Cloud Billing Catalog API to fetch per-resource SKU pricing.
 * CPU and RAM are priced separately; we reconstruct per-instance prices.
 * Filters SKUs by region for region-specific pricing.
 * Returns null if the API is unavailable.
 */

import { logger } from "../../../lib/logger.js";
import { resolveProviderKey } from "../../../lib/credential-resolver.js";
import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

const GCP_BILLING_URL = "https://cloudbilling.googleapis.com/v1/services/6F81-5844-456A/skus";

/** Map our canonical region IDs to GCP region names. */
const GCP_REGION_MAP: Record<string, string> = {
  "us-central1": "us-central1",
  "us-east1": "us-east1",
  "us-west1": "us-west1",
  "europe-west1": "europe-west1",
  "europe-west4": "europe-west4",
  "asia-east1": "asia-east1",
  "asia-southeast1": "asia-southeast1",
  "southamerica-east1": "southamerica-east1",
};

/** Curated machine types with known specs. */
const MACHINE_TYPES: Array<{
  id: string;
  name: string;
  vcpus: number;
  memory_gb: number;
  series: string;
}> = [
  { id: "e2-micro", name: "e2-micro (1 GB)", vcpus: 0.25, memory_gb: 1, series: "E2" },
  { id: "e2-small", name: "e2-small (2 GB)", vcpus: 0.5, memory_gb: 2, series: "E2" },
  { id: "e2-medium", name: "e2-medium (4 GB)", vcpus: 1, memory_gb: 4, series: "E2" },
  { id: "e2-standard-2", name: "e2-standard-2 (8 GB)", vcpus: 2, memory_gb: 8, series: "E2" },
  { id: "e2-standard-4", name: "e2-standard-4 (16 GB)", vcpus: 4, memory_gb: 16, series: "E2" },
  { id: "e2-standard-8", name: "e2-standard-8 (32 GB)", vcpus: 8, memory_gb: 32, series: "E2" },
  { id: "n2d-standard-2", name: "n2d-standard-2 (8 GB)", vcpus: 2, memory_gb: 8, series: "N2D" },
  { id: "n2d-standard-4", name: "n2d-standard-4 (16 GB)", vcpus: 4, memory_gb: 16, series: "N2D" },
  { id: "n2d-standard-8", name: "n2d-standard-8 (32 GB)", vcpus: 8, memory_gb: 32, series: "N2D" },
  { id: "c3-standard-4", name: "c3-standard-4 (16 GB)", vcpus: 4, memory_gb: 16, series: "C3" },
  { id: "c3-standard-8", name: "c3-standard-8 (32 GB)", vcpus: 8, memory_gb: 32, series: "C3" },
];

interface GcpSku {
  description: string;
  category: { resourceGroup: string };
  serviceRegions?: string[];
  pricingInfo: Array<{
    pricingExpression: {
      tieredRates: Array<{
        unitPrice: { units: string; nanos: number };
      }>;
    };
  }>;
}

function extractHourlyPrice(sku: GcpSku): number {
  const rate = sku.pricingInfo?.[0]?.pricingExpression?.tieredRates?.[0];
  if (!rate) return 0;
  return Number(rate.unitPrice.units) + rate.unitPrice.nanos / 1e9;
}

function skuMatchesRegion(sku: GcpSku, gcpRegion: string): boolean {
  if (!sku.serviceRegions || sku.serviceRegions.length === 0) return true;
  return sku.serviceRegions.some((r) => r === gcpRegion || r === "global");
}

export async function fetchGcpCatalog(
  config: CatalogFetcherConfig,
  region?: string,
): Promise<ComputeCatalog | null> {
  const apiKey = config.api_key_env ? await resolveProviderKey(config.api_key_env) : undefined;
  if (!apiKey) {
    logger.warn("No PRICING_GCP_API_KEY configured — GCP catalog unavailable");
    return null;
  }

  const gcpRegion = region ? (GCP_REGION_MAP[region] ?? region) : "us-central1";

  try {
    const cpuUrl = `${GCP_BILLING_URL}?key=${apiKey}&currencyCode=USD`;
    const res = await fetch(cpuUrl, { signal: AbortSignal.timeout(30_000) });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, body: errorBody.slice(0, 500), region: gcpRegion },
        "GCP Billing API returned non-OK",
      );
      return null;
    }

    const body = (await res.json()) as { skus?: GcpSku[] };
    const skus = body.skus ?? [];

    // Find E2/N2D/C3 CPU and RAM SKU prices filtered by region
    const cpuPrices: Record<string, number> = {};
    const ramPrices: Record<string, number> = {};

    for (const sku of skus) {
      if (!skuMatchesRegion(sku, gcpRegion)) continue;

      const desc = sku.description.toLowerCase();
      const group = sku.category?.resourceGroup?.toLowerCase() ?? "";

      for (const series of ["e2", "n2d", "c3"]) {
        if (desc.includes(series)) {
          if (group === "cpu" || desc.includes("cpu")) {
            cpuPrices[series] ??= extractHourlyPrice(sku);
          } else if (group === "ram" || desc.includes("ram")) {
            ramPrices[series] ??= extractHourlyPrice(sku);
          }
        }
      }
    }

    const sizes: ComputeSize[] = MACHINE_TYPES.map((mt) => {
      const seriesKey = mt.series.toLowerCase();
      const cpuRate = cpuPrices[seriesKey] ?? 0;
      const ramRate = ramPrices[seriesKey] ?? 0;
      const pricePerHour = mt.vcpus * cpuRate + mt.memory_gb * ramRate;

      return {
        id: mt.id,
        name: mt.name,
        provider: "gcp",
        category: "cpu" as const,
        vcpus: mt.vcpus,
        memory_gb: mt.memory_gb,
        storage_gb: 0,
        price_per_hour: Math.round(pricePerHour * 10000) / 10000,
        price_per_month: Math.round(pricePerHour * 730 * 100) / 100,
        price_source: cpuRate > 0 || ramRate > 0 ? ("api" as const) : ("api" as const),
        regions: [region ?? "us-central1"],
      };
    });

    return {
      provider: "gcp",
      sizes,
      storage_price_gb_month: 0.04,
      network_egress_gb_price: 0.08,
      network_egress_free_gb: 1,
      fetched_at: new Date().toISOString(),
      source: "live",
      ttl_seconds: config.ttl_seconds,
    };
  } catch (err) {
    logger.error({ err, region: gcpRegion }, "Failed to fetch GCP catalog");
    return null;
  }
}
