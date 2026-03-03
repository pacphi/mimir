/**
 * Azure compute catalog fetcher.
 *
 * Uses the public Azure Retail Prices API (no auth required).
 * Parameterized by region for region-specific pricing.
 * Returns null if the API is unavailable.
 */

import { logger } from "../../../lib/logger.js";
import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

const AZURE_PRICES_URL = "https://prices.azure.com/api/retail/prices";

/** Map our canonical region IDs to Azure ARM region names. */
const AZURE_REGION_MAP: Record<string, string> = {
  "us-east-1": "eastus",
  "us-east-2": "eastus2",
  "us-west-1": "westus",
  "us-west-2": "westus2",
  "eu-west-1": "westeurope",
  "eu-west-2": "uksouth",
  "eu-central-1": "germanywestcentral",
  "ap-southeast-1": "southeastasia",
  "ap-northeast-1": "japaneast",
  "sa-east-1": "brazilsouth",
};

/** Latest-gen VM series to include. */
const VM_ALLOWLIST = [
  "Standard_B1s",
  "Standard_B1ms",
  "Standard_B2s",
  "Standard_B2ms",
  "Standard_B4ms",
  "Standard_B8ms",
  "Standard_D2s_v5",
  "Standard_D4s_v5",
  "Standard_D8s_v5",
  "Standard_E2s_v5",
  "Standard_E4s_v5",
  "Standard_E8s_v5",
];

/** Known specs for VM series. */
const VM_SPECS: Record<string, { vcpus: number; memory_gb: number }> = {
  Standard_B1s: { vcpus: 1, memory_gb: 1 },
  Standard_B1ms: { vcpus: 1, memory_gb: 2 },
  Standard_B2s: { vcpus: 2, memory_gb: 4 },
  Standard_B2ms: { vcpus: 2, memory_gb: 8 },
  Standard_B4ms: { vcpus: 4, memory_gb: 16 },
  Standard_B8ms: { vcpus: 8, memory_gb: 32 },
  Standard_D2s_v5: { vcpus: 2, memory_gb: 8 },
  Standard_D4s_v5: { vcpus: 4, memory_gb: 16 },
  Standard_D8s_v5: { vcpus: 8, memory_gb: 32 },
  Standard_E2s_v5: { vcpus: 2, memory_gb: 16 },
  Standard_E4s_v5: { vcpus: 4, memory_gb: 32 },
  Standard_E8s_v5: { vcpus: 8, memory_gb: 64 },
};

interface AzurePriceItem {
  armSkuName: string;
  retailPrice: number;
  unitOfMeasure: string;
  type: string;
  productName: string;
  skuName: string;
  serviceName: string;
  armRegionName: string;
  meterName: string;
}

export async function fetchAzureCatalog(
  config: CatalogFetcherConfig,
  region?: string,
): Promise<ComputeCatalog | null> {
  const azureRegion = region ? (AZURE_REGION_MAP[region] ?? region) : "eastus";

  try {
    const filter = [
      "serviceName eq 'Virtual Machines'",
      `armRegionName eq '${azureRegion}'`,
      "priceType eq 'Consumption'",
    ].join(" and ");

    const url = `${AZURE_PRICES_URL}?api-version=2023-01-01-preview&$filter=${encodeURIComponent(filter)}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      logger.warn({ status: res.status, region: azureRegion }, "Azure Prices API returned non-OK");
      return null;
    }

    const body = (await res.json()) as { Items?: AzurePriceItem[] };
    const items = body.Items ?? [];

    const sizes: ComputeSize[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      const sku = item.armSkuName;
      if (
        !sku ||
        seen.has(sku) ||
        !VM_ALLOWLIST.includes(sku) ||
        item.unitOfMeasure !== "1 Hour" ||
        item.type !== "Consumption" ||
        item.meterName.includes("Spot") ||
        item.meterName.includes("Low Priority")
      ) {
        continue;
      }

      const specs = VM_SPECS[sku];
      if (!specs) continue;

      sizes.push({
        id: sku,
        name: `${sku} (${specs.memory_gb} GB)`,
        provider: "azure",
        category: "cpu",
        vcpus: specs.vcpus,
        memory_gb: specs.memory_gb,
        storage_gb: 0,
        price_per_hour: item.retailPrice,
        price_per_month: Math.round(item.retailPrice * 730 * 100) / 100,
        price_source: "api",
        regions: [region ?? "us-east-1"],
      });

      seen.add(sku);
    }

    if (sizes.length === 0) {
      logger.warn({ region: azureRegion }, "Azure API returned 0 matching VMs");
      return null;
    }

    sizes.sort((a, b) => a.price_per_hour - b.price_per_hour);

    return {
      provider: "azure",
      sizes,
      storage_price_gb_month: 0.095,
      network_egress_gb_price: 0.087,
      network_egress_free_gb: 5,
      fetched_at: new Date().toISOString(),
      source: "live",
      ttl_seconds: config.ttl_seconds,
    };
  } catch (err) {
    logger.error({ err, region: azureRegion }, "Failed to fetch Azure catalog");
    return null;
  }
}
