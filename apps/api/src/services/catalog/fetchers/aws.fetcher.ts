/**
 * AWS EC2 compute catalog fetcher.
 *
 * Uses the AWS Pricing API (GetProducts) with server-side filters to fetch
 * only the instance types we care about. This is MUCH faster than the bulk
 * pricing file (~KB vs ~400MB).
 *
 * Requires AWS credentials: PRICING_AWS_ACCESS_KEY_ID / PRICING_AWS_SECRET_ACCESS_KEY,
 * or standard AWS credential chain (instance role, ~/.aws/credentials, etc.).
 */

import { PricingClient, GetProductsCommand } from "@aws-sdk/client-pricing";
import { logger } from "../../../lib/logger.js";
import { resolveProviderKey } from "../../../lib/credential-resolver.js";
import type { CatalogFetcherConfig, ComputeCatalog, ComputeSize } from "../types.js";

// ─── Instance allowlist & specs ──────────────────────────────────────────────

/**
 * Latest-gen instance type prefixes per compute family.
 * Only the newest generation for each family — keeps the catalog focused.
 *
 * Burstable:       t3a / t3      (latest x86; t4g is ARM-only)
 * General purpose: m7i / m7a
 * Compute:         c7i / c7a
 * Memory:          r7i / r7a
 * GPU:             g6
 * HPC GPU:         p5
 */
const INSTANCE_ALLOWLIST = [
  "t3a.",
  "t3.",
  "m7i.",
  "m7a.",
  "c7i.",
  "c7a.",
  "r7i.",
  "r7a.",
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
  "c7i.large": { vcpus: 2, memory_gb: 4 },
  "c7i.xlarge": { vcpus: 4, memory_gb: 8 },
  "c7i.2xlarge": { vcpus: 8, memory_gb: 16 },
  "c7a.large": { vcpus: 2, memory_gb: 4 },
  "c7a.xlarge": { vcpus: 4, memory_gb: 8 },
  "c7a.2xlarge": { vcpus: 8, memory_gb: 16 },
  "r7i.large": { vcpus: 2, memory_gb: 16 },
  "r7i.xlarge": { vcpus: 4, memory_gb: 32 },
  "r7i.2xlarge": { vcpus: 8, memory_gb: 64 },
  "r7a.large": { vcpus: 2, memory_gb: 16 },
  "r7a.xlarge": { vcpus: 4, memory_gb: 32 },
  "r7a.2xlarge": { vcpus: 8, memory_gb: 64 },
  "g6.xlarge": { vcpus: 4, memory_gb: 16 },
  "g6.2xlarge": { vcpus: 8, memory_gb: 32 },
  "p5.48xlarge": { vcpus: 192, memory_gb: 2048 },
};

function isAllowlisted(instanceType: string): boolean {
  return INSTANCE_ALLOWLIST.some((prefix) => instanceType.startsWith(prefix));
}

// ─── Pricing API client ──────────────────────────────────────────────────────

/**
 * Create an authenticated PricingClient.
 * The Pricing API is only available in us-east-1 and ap-south-1.
 */
async function createPricingClient(config: CatalogFetcherConfig): Promise<PricingClient | null> {
  const accessKeyId = config.api_key_env ? await resolveProviderKey(config.api_key_env) : undefined;
  const secretAccessKey = config.secret_key_env
    ? await resolveProviderKey(config.secret_key_env)
    : undefined;

  // If explicit credentials are provided, use them
  if (accessKeyId && secretAccessKey) {
    return new PricingClient({
      region: "us-east-1",
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  // Fall back to default credential chain (instance role, env vars, etc.)
  try {
    return new PricingClient({ region: "us-east-1" });
  } catch {
    return null;
  }
}

// ─── Product parsing ─────────────────────────────────────────────────────────

interface ProductAttributes {
  instanceType?: string;
  vcpu?: string;
  memory?: string;
  tenancy?: string;
  operatingSystem?: string;
  currentGeneration?: string;
  capacitystatus?: string;
}

interface PriceDimension {
  pricePerUnit: { USD?: string };
  unit: string;
}

interface PricingTerm {
  priceDimensions: Record<string, PriceDimension>;
}

interface ProductDocument {
  product: { attributes: ProductAttributes };
  terms: { OnDemand?: Record<string, PricingTerm> };
}

function parseProduct(jsonStr: string, targetRegion: string): ComputeSize | null {
  let doc: ProductDocument;
  try {
    doc = JSON.parse(jsonStr) as ProductDocument;
  } catch {
    return null;
  }

  const attrs = doc.product.attributes;
  const instanceType = attrs.instanceType;
  if (!instanceType || !isAllowlisted(instanceType)) return null;

  // Extract pricing from OnDemand terms
  const onDemand = doc.terms?.OnDemand;
  if (!onDemand) return null;

  const firstTerm = Object.values(onDemand)[0];
  if (!firstTerm) return null;

  const dim = Object.values(firstTerm.priceDimensions)[0];
  if (!dim || dim.unit !== "Hrs") return null;

  const pricePerHour = parseFloat(dim.pricePerUnit.USD ?? "0");
  if (isNaN(pricePerHour) || pricePerHour === 0) return null;

  // Use our known specs, or parse from attributes
  const specs = INSTANCE_SPECS[instanceType];
  const vcpus = specs?.vcpus ?? parseInt(attrs.vcpu ?? "0", 10);
  const memoryStr = (attrs.memory ?? "0").replace(/[^\d.]/g, "");
  const memoryGb = specs?.memory_gb ?? parseFloat(memoryStr);

  const isGpu = instanceType.startsWith("g6.") || instanceType.startsWith("p5.");

  return {
    id: instanceType,
    name: instanceType,
    provider: "aws",
    category: isGpu ? "gpu" : "cpu",
    vcpus,
    memory_gb: memoryGb,
    storage_gb: 0,
    price_per_hour: pricePerHour,
    price_per_month: Math.round(pricePerHour * 730 * 100) / 100,
    price_source: "api",
    regions: [targetRegion],
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchAwsCatalog(
  config: CatalogFetcherConfig,
  region?: string,
): Promise<ComputeCatalog | null> {
  const targetRegion = region ?? "us-east-1";

  const client = await createPricingClient(config);
  if (!client) {
    logger.warn("No AWS credentials available for Pricing API");
    return null;
  }

  try {
    logger.info({ region: targetRegion }, "AWS catalog fetch starting (Pricing API)");

    const sizes: ComputeSize[] = [];
    const seen = new Set<string>();
    let nextToken: string | undefined;

    // Paginate through GetProducts results
    do {
      const command = new GetProductsCommand({
        ServiceCode: "AmazonEC2",
        Filters: [
          { Type: "TERM_MATCH", Field: "regionCode", Value: targetRegion },
          { Type: "TERM_MATCH", Field: "operatingSystem", Value: "Linux" },
          { Type: "TERM_MATCH", Field: "tenancy", Value: "Shared" },
          { Type: "TERM_MATCH", Field: "currentGeneration", Value: "Yes" },
          { Type: "TERM_MATCH", Field: "capacitystatus", Value: "Used" },
          { Type: "TERM_MATCH", Field: "preInstalledSw", Value: "NA" },
        ],
        MaxResults: 100,
        NextToken: nextToken,
      });

      const response = await client.send(command);

      for (const priceStr of response.PriceList ?? []) {
        const size = parseProduct(priceStr, targetRegion);
        if (size && !seen.has(size.id)) {
          sizes.push(size);
          seen.add(size.id);
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    if (sizes.length === 0) {
      logger.warn({ region: targetRegion }, "AWS Pricing API returned 0 matching instances");
      return null;
    }

    sizes.sort((a, b) => a.price_per_hour - b.price_per_hour);

    logger.info({ region: targetRegion, count: sizes.length }, "AWS catalog fetch complete");

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
    logger.error({ err, region: targetRegion }, "Failed to fetch AWS catalog via Pricing API");
    return null;
  }
}
