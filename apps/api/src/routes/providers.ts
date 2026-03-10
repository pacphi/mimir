/**
 * Provider catalog routes.
 *
 * GET  /api/v1/providers                                    — list all supported providers
 * GET  /api/v1/providers/:provider/regions                  — list regions for a provider
 * GET  /api/v1/providers/:provider/compute-catalog          — compute sizes with live pricing
 * GET  /api/v1/providers/:provider/compute-catalog/estimate — cost estimate for a specific size
 * POST /api/v1/providers/:provider/compute-catalog/refresh  — force refresh cached catalog (admin only)
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitDefault, rateLimitStrict } from "../middleware/rateLimit.js";
import { logger } from "../lib/logger.js";
import { getCatalog, refreshCatalog, estimateCost } from "../services/catalog/catalog.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Static provider metadata (no pricing or VM sizes — served dynamically)
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: "fly",
    name: "Fly.io",
    description: "Global app hosting platform with edge deployments",
    regions: [
      { id: "ams", name: "Amsterdam, Netherlands", location: "EU West 1" },
      { id: "arn", name: "Stockholm, Sweden", location: "EU North" },
      { id: "bom", name: "Mumbai, India", location: "Asia South" },
      { id: "cdg", name: "Paris, France", location: "EU West 2" },
      { id: "dfw", name: "Dallas, Texas", location: "US Central 1" },
      { id: "ewr", name: "Secaucus, NJ", location: "US East 1" },
      { id: "fra", name: "Frankfurt, Germany", location: "EU Central" },
      { id: "gru", name: "Sao Paulo, Brazil", location: "South America" },
      { id: "iad", name: "Ashburn, Virginia", location: "US East 2" },
      { id: "jnb", name: "Johannesburg, South Africa", location: "Africa" },
      { id: "lax", name: "Los Angeles, California", location: "US West 1" },
      { id: "lhr", name: "London, United Kingdom", location: "EU West 3" },
      { id: "nrt", name: "Tokyo, Japan", location: "Asia East" },
      { id: "ord", name: "Chicago, Illinois", location: "US Central 2" },
      { id: "sin", name: "Singapore", location: "Asia Southeast" },
      { id: "sjc", name: "San Jose, California", location: "US West 2" },
      { id: "syd", name: "Sydney, Australia", location: "Oceania" },
      { id: "yyz", name: "Toronto, Canada", location: "Canada" },
    ],
  },
  {
    id: "docker",
    name: "Docker",
    description: "Local Docker container deployment",
    regions: [{ id: "local", name: "Local", location: "Local Machine" }],
  },
  {
    id: "digitalocean",
    name: "DigitalOcean",
    description: "DigitalOcean Droplets via DevPod",
    regions: [
      { id: "nyc1", name: "New York 1", location: "US East" },
      { id: "nyc3", name: "New York 3", location: "US East" },
      { id: "ams3", name: "Amsterdam 3", location: "EU West" },
      { id: "sfo2", name: "San Francisco 2", location: "US West" },
      { id: "sfo3", name: "San Francisco 3", location: "US West" },
      { id: "fra1", name: "Frankfurt 1", location: "EU Central" },
      { id: "lon1", name: "London 1", location: "EU West" },
      { id: "sgp1", name: "Singapore 1", location: "Asia Southeast" },
      { id: "tor1", name: "Toronto 1", location: "Canada" },
      { id: "blr1", name: "Bangalore 1", location: "Asia South" },
      { id: "syd1", name: "Sydney 1", location: "Oceania" },
    ],
  },
  {
    id: "e2b",
    name: "E2B",
    description: "Cloud sandboxes for AI agents",
    regions: [
      { id: "us-east-1", name: "US East", location: "AWS us-east-1" },
      { id: "eu-west-1", name: "EU West", location: "AWS eu-west-1" },
    ],
  },
  {
    id: "kubernetes",
    name: "Kubernetes",
    description: "Deploy to any Kubernetes cluster",
    regions: [
      { id: "default", name: "Default Namespace", location: "Cluster Default" },
      { id: "production", name: "Production", location: "Cluster Production" },
      { id: "staging", name: "Staging", location: "Cluster Staging" },
    ],
  },
  {
    id: "runpod",
    name: "RunPod",
    description: "GPU cloud for AI/ML workloads",
    regions: [
      { id: "us-east-1", name: "US East", location: "US East Coast" },
      { id: "us-west-2", name: "US West", location: "US West Coast" },
      { id: "eu-central-1", name: "EU Central", location: "Europe" },
    ],
  },
  {
    id: "northflank",
    name: "Northflank",
    description: "Developer platform for deploying containers and services",
    regions: [
      { id: "us-east-1", name: "US East", location: "US East Coast" },
      { id: "us-west-2", name: "US West", location: "US West Coast" },
      { id: "eu-west-1", name: "EU West", location: "Europe West" },
      { id: "eu-central-1", name: "EU Central", location: "Europe Central" },
      { id: "ap-southeast-1", name: "Asia Pacific", location: "Singapore" },
    ],
  },
  {
    id: "aws",
    name: "AWS",
    description: "Amazon Web Services EC2 instances",
    regions: [
      { id: "us-east-1", name: "US East (N. Virginia)", location: "US East 1" },
      { id: "us-east-2", name: "US East (Ohio)", location: "US East 2" },
      { id: "us-west-1", name: "US West (N. California)", location: "US West 1" },
      { id: "us-west-2", name: "US West (Oregon)", location: "US West 2" },
      { id: "eu-west-1", name: "Europe (Ireland)", location: "EU West 1" },
      { id: "eu-west-2", name: "Europe (London)", location: "EU West 2" },
      { id: "eu-central-1", name: "Europe (Frankfurt)", location: "EU Central 1" },
      { id: "ap-southeast-1", name: "Asia Pacific (Singapore)", location: "AP Southeast 1" },
      { id: "ap-northeast-1", name: "Asia Pacific (Tokyo)", location: "AP Northeast 1" },
      { id: "sa-east-1", name: "South America (Sao Paulo)", location: "SA East 1" },
    ],
  },
  {
    id: "gcp",
    name: "GCP",
    description: "Google Cloud Platform Compute Engine",
    regions: [
      { id: "us-central1", name: "US Central (Iowa)", location: "US Central" },
      { id: "us-east1", name: "US East (S. Carolina)", location: "US East" },
      { id: "us-west1", name: "US West (Oregon)", location: "US West" },
      { id: "europe-west1", name: "Europe West (Belgium)", location: "EU West" },
      { id: "europe-west4", name: "Europe West (Netherlands)", location: "EU West 4" },
      { id: "asia-east1", name: "Asia East (Taiwan)", location: "Asia East" },
      { id: "asia-southeast1", name: "Asia Southeast (Singapore)", location: "Asia Southeast" },
      { id: "southamerica-east1", name: "South America (Sao Paulo)", location: "SA East" },
    ],
  },
  {
    id: "azure",
    name: "Azure",
    description: "Microsoft Azure Virtual Machines",
    regions: [
      { id: "us-east-1", name: "East US", location: "US East" },
      { id: "us-east-2", name: "East US 2", location: "US East 2" },
      { id: "us-west-1", name: "West US", location: "US West" },
      { id: "us-west-2", name: "West US 2", location: "US West 2" },
      { id: "eu-west-1", name: "West Europe", location: "EU West" },
      { id: "eu-west-2", name: "UK South", location: "EU West 2" },
      { id: "eu-central-1", name: "Germany West Central", location: "EU Central" },
      { id: "ap-southeast-1", name: "Southeast Asia", location: "AP Southeast" },
      { id: "ap-northeast-1", name: "Japan East", location: "AP Northeast" },
      { id: "sa-east-1", name: "Brazil South", location: "SA East" },
    ],
  },
] as const;

const VALID_PROVIDER_IDS = PROVIDERS.map((p) => p.id);

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const providers = new Hono();

providers.use("*", authMiddleware);

// ─── GET /api/v1/providers ────────────────────────────────────────────────────

providers.get("/", rateLimitDefault, (c) => {
  const list = PROVIDERS.map(({ regions: _regions, ...rest }) => rest);
  return c.json({ providers: list });
});

// ─── GET /api/v1/providers/:provider/regions ─────────────────────────────────

providers.get("/:provider/regions", rateLimitDefault, (c) => {
  const providerId = c.req.param("provider")!;

  if (!VALID_PROVIDER_IDS.includes(providerId as (typeof VALID_PROVIDER_IDS)[number])) {
    return c.json({ error: "Not Found", message: `Provider '${providerId}' not found` }, 404);
  }

  const provider = PROVIDERS.find((p) => p.id === providerId);
  return c.json({ regions: provider?.regions ?? [] });
});

// ─── GET /api/v1/providers/:provider/compute-catalog ─────────────────────────

providers.get("/:provider/compute-catalog", rateLimitDefault, async (c) => {
  const providerId = c.req.param("provider")!;

  if (!VALID_PROVIDER_IDS.includes(providerId as (typeof VALID_PROVIDER_IDS)[number])) {
    return c.json({ error: "Not Found", message: `Provider '${providerId}' not found` }, 404);
  }

  const region = c.req.query("region");

  try {
    const catalog = await getCatalog(providerId, region ?? undefined);
    if (!catalog) {
      return c.json(
        {
          error: "Service Unavailable",
          message: `Compute catalog for '${providerId}' is currently unavailable. The pricing data could not be fetched — please try again later.`,
        },
        503,
      );
    }

    return c.json({
      sizes: catalog.sizes,
      storage_pricing: {
        gb_per_month: catalog.storage_price_gb_month,
      },
      network_pricing: {
        egress_gb_price: catalog.network_egress_gb_price,
        egress_free_gb: catalog.network_egress_free_gb,
      },
      fetched_at: catalog.fetched_at,
      source: catalog.source,
    });
  } catch (err) {
    logger.error({ err, provider: providerId }, "Failed to fetch compute catalog");
    return c.json(
      {
        error: "Internal Server Error",
        message:
          "An unexpected error occurred while fetching the compute catalog. Please try again later.",
      },
      500,
    );
  }
});

// ─── GET /api/v1/providers/:provider/compute-catalog/estimate ────────────────

providers.get("/:provider/compute-catalog/estimate", rateLimitDefault, async (c) => {
  const providerId = c.req.param("provider")!;

  if (!VALID_PROVIDER_IDS.includes(providerId as (typeof VALID_PROVIDER_IDS)[number])) {
    return c.json({ error: "Not Found", message: `Provider '${providerId}' not found` }, 404);
  }

  const sizeId = c.req.query("size_id");
  if (!sizeId) {
    return c.json({ error: "Bad Request", message: "size_id query parameter is required" }, 400);
  }

  const region = c.req.query("region");
  const diskGb = parseInt(c.req.query("disk_gb") ?? "20", 10);
  const egressGb = parseInt(c.req.query("egress_gb") ?? "10", 10);

  try {
    const estimate = await estimateCost(providerId, sizeId, diskGb, egressGb, region ?? undefined);
    if (!estimate) {
      return c.json(
        {
          error: "Not Found",
          message: `Size '${sizeId}' not found for provider '${providerId}', or pricing data is currently unavailable.`,
        },
        404,
      );
    }

    return c.json(estimate);
  } catch (err) {
    logger.error({ err, provider: providerId, sizeId }, "Failed to estimate cost");
    return c.json(
      {
        error: "Internal Server Error",
        message: "An unexpected error occurred while estimating costs. Please try again later.",
      },
      500,
    );
  }
});

// ─── POST /api/v1/providers/:provider/compute-catalog/refresh ────────────────

providers.post("/:provider/compute-catalog/refresh", rateLimitStrict, async (c) => {
  const providerId = c.req.param("provider")!;

  if (!VALID_PROVIDER_IDS.includes(providerId as (typeof VALID_PROVIDER_IDS)[number])) {
    return c.json({ error: "Not Found", message: `Provider '${providerId}' not found` }, 404);
  }

  // Admin-only
  const auth = c.var.auth;
  if (auth.role !== "ADMIN") {
    return c.json({ error: "Forbidden", message: "Admin role required" }, 403);
  }

  const region = c.req.query("region");

  try {
    const catalog = await refreshCatalog(providerId, region ?? undefined);
    if (!catalog) {
      return c.json(
        {
          error: "Service Unavailable",
          message: `Failed to refresh catalog for '${providerId}'. The provider's pricing API may be unavailable.`,
        },
        503,
      );
    }

    return c.json({
      message: "Catalog refreshed",
      provider: providerId,
      sizes_count: catalog.sizes.length,
      source: catalog.source,
      fetched_at: catalog.fetched_at,
    });
  } catch (err) {
    logger.error({ err, provider: providerId }, "Failed to refresh catalog");
    return c.json(
      {
        error: "Internal Server Error",
        message:
          "An unexpected error occurred while refreshing the catalog. Please try again later.",
      },
      500,
    );
  }
});

export { providers as providersRouter };
