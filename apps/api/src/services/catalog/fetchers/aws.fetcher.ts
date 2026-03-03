/**
 * AWS EC2 compute catalog fetcher.
 *
 * Uses the public AWS bulk pricing endpoint, parameterized by region.
 * Returns null if the API is unavailable.
 */

import { logger } from "../../../lib/logger.js";
import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

/**
 * Map our canonical region IDs to AWS region names.
 * AWS regions in PROVIDERS already use AWS naming, so this is mostly pass-through.
 */
const AWS_REGION_MAP: Record<string, string> = {
  "us-east-1": "us-east-1",
  "us-east-2": "us-east-2",
  "us-west-1": "us-west-1",
  "us-west-2": "us-west-2",
  "eu-west-1": "eu-west-1",
  "eu-west-2": "eu-west-2",
  "eu-central-1": "eu-central-1",
  "ap-southeast-1": "ap-southeast-1",
  "ap-northeast-1": "ap-northeast-1",
  "sa-east-1": "sa-east-1",
};

function awsPricingUrl(region: string): string {
  const awsRegion = AWS_REGION_MAP[region] ?? region;
  return `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/${awsRegion}/index.json`;
}

/** Latest-gen instance type prefixes to include. */
const INSTANCE_ALLOWLIST = [
  "t3a.",
  "t3.",
  "m7i.",
  "m7a.",
  "m6i.",
  "c7i.",
  "c7a.",
  "c6i.",
  "r7i.",
  "r7a.",
  "r6i.",
  "g6.",
  "p5.",
];

/** Known vCPU and memory for common instance types. */
const INSTANCE_SPECS: Record<string, { vcpus: number; memory_gb: number }> = {
  "t3.micro": { vcpus: 2, memory_gb: 1 },
  "t3.small": { vcpus: 2, memory_gb: 2 },
  "t3.medium": { vcpus: 2, memory_gb: 4 },
  "t3.large": { vcpus: 2, memory_gb: 8 },
  "t3.xlarge": { vcpus: 4, memory_gb: 16 },
  "t3.2xlarge": { vcpus: 8, memory_gb: 32 },
  "t3a.micro": { vcpus: 2, memory_gb: 1 },
  "t3a.small": { vcpus: 2, memory_gb: 2 },
  "t3a.medium": { vcpus: 2, memory_gb: 4 },
  "t3a.large": { vcpus: 2, memory_gb: 8 },
  "t3a.xlarge": { vcpus: 4, memory_gb: 16 },
  "t3a.2xlarge": { vcpus: 8, memory_gb: 32 },
  "m7i.large": { vcpus: 2, memory_gb: 8 },
  "m7i.xlarge": { vcpus: 4, memory_gb: 16 },
  "m7i.2xlarge": { vcpus: 8, memory_gb: 32 },
  "m7a.large": { vcpus: 2, memory_gb: 8 },
  "m7a.xlarge": { vcpus: 4, memory_gb: 16 },
  "m7a.2xlarge": { vcpus: 8, memory_gb: 32 },
  "m6i.large": { vcpus: 2, memory_gb: 8 },
  "m6i.xlarge": { vcpus: 4, memory_gb: 16 },
  "m6i.2xlarge": { vcpus: 8, memory_gb: 32 },
  "c7i.large": { vcpus: 2, memory_gb: 4 },
  "c7i.xlarge": { vcpus: 4, memory_gb: 8 },
  "c7i.2xlarge": { vcpus: 8, memory_gb: 16 },
  "c7a.large": { vcpus: 2, memory_gb: 4 },
  "c7a.xlarge": { vcpus: 4, memory_gb: 8 },
  "c7a.2xlarge": { vcpus: 8, memory_gb: 16 },
  "c6i.large": { vcpus: 2, memory_gb: 4 },
  "c6i.xlarge": { vcpus: 4, memory_gb: 8 },
  "c6i.2xlarge": { vcpus: 8, memory_gb: 16 },
  "r7i.large": { vcpus: 2, memory_gb: 16 },
  "r7i.xlarge": { vcpus: 4, memory_gb: 32 },
  "r7i.2xlarge": { vcpus: 8, memory_gb: 64 },
  "r7a.large": { vcpus: 2, memory_gb: 16 },
  "r7a.xlarge": { vcpus: 4, memory_gb: 32 },
  "r7a.2xlarge": { vcpus: 8, memory_gb: 64 },
  "r6i.large": { vcpus: 2, memory_gb: 16 },
  "r6i.xlarge": { vcpus: 4, memory_gb: 32 },
  "r6i.2xlarge": { vcpus: 8, memory_gb: 64 },
  "g6.xlarge": { vcpus: 4, memory_gb: 16 },
  "g6.2xlarge": { vcpus: 8, memory_gb: 32 },
  "p5.48xlarge": { vcpus: 192, memory_gb: 2048 },
};

function isAllowlisted(instanceType: string): boolean {
  return INSTANCE_ALLOWLIST.some((prefix) => instanceType.startsWith(prefix));
}

interface AwsPricingProduct {
  attributes: {
    instanceType?: string;
    tenancy?: string;
    operatingSystem?: string;
    currentGeneration?: string;
    capacitystatus?: string;
  };
}

interface AwsPricingTerm {
  priceDimensions: Record<
    string,
    {
      pricePerUnit: { USD: string };
      unit: string;
    }
  >;
}

export async function fetchAwsCatalog(
  config: CatalogFetcherConfig,
  region?: string,
): Promise<ComputeCatalog | null> {
  const targetRegion = region ?? "us-east-1";

  try {
    const res = await fetch(awsPricingUrl(targetRegion), {
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, region: targetRegion }, "AWS pricing API returned non-OK");
      return null;
    }

    const body = (await res.json()) as {
      products?: Record<string, AwsPricingProduct>;
      terms?: { OnDemand?: Record<string, Record<string, AwsPricingTerm>> };
    };

    if (!body.products || !body.terms?.OnDemand) {
      logger.warn({ region: targetRegion }, "AWS pricing response missing expected fields");
      return null;
    }

    const sizes: ComputeSize[] = [];
    const seen = new Set<string>();

    for (const [sku, product] of Object.entries(body.products)) {
      const attrs = product.attributes;
      const instanceType = attrs.instanceType;
      if (
        !instanceType ||
        seen.has(instanceType) ||
        !isAllowlisted(instanceType) ||
        attrs.tenancy !== "Shared" ||
        attrs.operatingSystem !== "Linux" ||
        attrs.currentGeneration !== "Yes" ||
        attrs.capacitystatus !== "Used"
      ) {
        continue;
      }

      const termData = body.terms.OnDemand[sku];
      if (!termData) continue;

      const firstTerm = Object.values(termData)[0];
      if (!firstTerm) continue;

      const dim = Object.values(firstTerm.priceDimensions)[0];
      if (!dim || dim.unit !== "Hrs") continue;

      const pricePerHour = parseFloat(dim.pricePerUnit.USD);
      if (isNaN(pricePerHour) || pricePerHour === 0) continue;

      const specs = INSTANCE_SPECS[instanceType];
      const isGpu = instanceType.startsWith("g6.") || instanceType.startsWith("p5.");

      sizes.push({
        id: instanceType,
        name: instanceType,
        provider: "aws",
        category: isGpu ? "gpu" : "cpu",
        vcpus: specs?.vcpus ?? 0,
        memory_gb: specs?.memory_gb ?? 0,
        storage_gb: 0,
        price_per_hour: pricePerHour,
        price_per_month: Math.round(pricePerHour * 730 * 100) / 100,
        price_source: "api",
        regions: [targetRegion],
      });

      seen.add(instanceType);
    }

    if (sizes.length === 0) {
      logger.warn({ region: targetRegion }, "AWS pricing returned 0 matching instances");
      return null;
    }

    sizes.sort((a, b) => a.price_per_hour - b.price_per_hour);

    return {
      provider: "aws",
      sizes,
      storage_price_gb_month: 0.08,
      network_egress_gb_price: 0.09,
      network_egress_free_gb: 1,
      fetched_at: new Date().toISOString(),
      source: "live",
      ttl_seconds: config.ttl_seconds,
    };
  } catch (err) {
    logger.error({ err, region: targetRegion }, "Failed to fetch AWS catalog");
    return null;
  }
}
