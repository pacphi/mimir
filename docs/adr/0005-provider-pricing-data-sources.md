# ADR 0005: Provider Pricing Data Sources

**Date:** 2026-02-26
**Status:** Proposed

---

## Context

Each cloud provider exposes pricing data differently — some have public APIs (AWS, Azure), some require authentication (Fly, RunPod, Northflank, GCP), some have no pricing API at all (E2B, Docker, Kubernetes). DevPod is a meta-provider that delegates to underlying infrastructure.

The dynamic compute catalog (ADR 0004) needs a per-provider strategy for sourcing pricing data that balances accuracy, data volume, and maintenance burden.

---

## Decision

### Per-Provider Strategy

#### Fly.io

- **API**: GraphQL `POST api.fly.io/graphql` → `platform.vmSizes`
- **Auth**: Bearer token from `PRICING_FLY_API_TOKEN` env var
- **Data**: Returns all VM presets with `priceMonth` and `priceSecond` fields
- **Refresh**: Every 6 hours (default)

#### RunPod

- **API**: GraphQL `POST api.runpod.io/graphql` → `gpuTypes`
- **Auth**: API key from `PRICING_RUNPOD_API_KEY` env var
- **Data**: Returns GPU types with `securePrice`, `communityPrice`, and real-time `stockStatus`
- **Note**: CPU-only tiers not exposed via GPU API; supplemented with static data
- **Refresh**: Every 4 hours (default)

#### Northflank

- **API**: REST `GET api.northflank.com/v1/plans`
- **Auth**: Bearer token from `PRICING_NORTHFLANK_API_TOKEN` env var
- **Data**: Returns compute plans with CPU (millicores), memory (MB), and pricing
- **Refresh**: Every 12 hours (default)

#### AWS

- **API**: Public bulk JSON `pricing.us-east-1.amazonaws.com/.../us-east-1/index.json`
- **Auth**: None (fully public)
- **Data**: Full EC2 pricing index (100s of MB); filtered via curated allowlist
- **Allowlist**: `t3/t3a`, `m6i/m7i/m7a`, `c6i/c7i/c7a`, `r6i/r7i/r7a`, `g6`, `p5` families
- **Instance specs**: Maintained in a static lookup table (vCPU/memory per instance type)
- **Refresh**: Daily (default)

#### GCP

- **API**: Cloud Billing Catalog `cloudbilling.googleapis.com/v1/services/6F81-5844-456A/skus`
- **Auth**: API key from `PRICING_GCP_API_KEY` env var
- **Data**: Per-resource SKUs (CPU and RAM priced separately per machine series)
- **Price reconstruction**: `(vCPUs × CPU_SKU_price) + (memoryGB × RAM_SKU_price)`
- **Machine type allowlist**: `e2-*`, `n2d-standard-2/4/8`, `c3-standard-4/8`
- **Refresh**: Daily (default)

#### Azure

- **API**: Retail Prices `prices.azure.com/api/retail/prices`
- **Auth**: None (fully public)
- **Filter**: `serviceName eq 'Virtual Machines' and armRegionName eq 'eastus' and priceType eq 'Consumption'`
- **VM allowlist**: `Standard_B*`, `Standard_D*s_v5`, `Standard_E*s_v5` series
- **VM specs**: Maintained in a static lookup table
- **Refresh**: Daily (default)

#### E2B

- **API**: None — formula-based pricing
- **Formula**: `$0.000014/vCPU/sec + $0.0000045/GB/sec` (= `$0.0504/vCPU/hr + $0.0162/GB/hr`)
- **Sizes**: Predefined combos (1c/512MB through 8c/8GB)
- **No refresh needed**: formula is applied on each fetch

#### Docker

- **API**: None — local deployment
- **Default pricing**: $0 (user's own hardware)
- **Custom pricing**: Maintainers can set per-tier hourly costs via `CATALOG_DOCKER_{SIZE}_PRICE_HR` env vars
- **Host detection**: Reads `os.cpus()` and `os.totalmem()` to filter tiers exceeding host capacity

#### Kubernetes

- **API**: None — cluster-dependent
- **Default pricing**: $0 with note "Cost depends on your cluster infrastructure"
- **Custom pricing**: Maintainers can set per-tier hourly costs via `CATALOG_K8S_{SIZE}_PRICE_HR` env vars
- **UI badge**: Shows "Custom pricing" when maintainer has configured prices, "Infrastructure-dependent" when $0

#### DevPod

- **API**: None — delegates to underlying provider
- **Frontend flow**: Two-step selection — choose backend (AWS/GCP/Azure/SSH/Local), then fetch that backend's catalog
- **For SSH/Local**: Shows generic resource tiers with $0 pricing
- **For cloud backends**: Reuses the corresponding cloud provider's catalog data

### Allowlist Maintenance

AWS, GCP, and Azure use curated allowlists of latest-generation instance types. When new instance generations launch:

1. Add new family prefixes/types to the fetcher's allowlist constant
2. Add specs (vCPU, memory) to the static lookup table (AWS, Azure) or machine type list (GCP)
3. Old generations can be removed when they become less relevant

This keeps the data volume manageable (~50-100 instance types per provider) while covering the most common use cases.

### Custom Pricing for Infrastructure-Dependent Providers

Docker and Kubernetes show $0 pricing by default because cost depends on the user's infrastructure. Maintainers running Mimir for their organization can configure custom prices to reflect their actual infrastructure costs (e.g., internal chargeback rates).

---

## Consequences

**Positive:**

- Each provider uses the most appropriate data source for its ecosystem.
- Public APIs (AWS, Azure) don't require any authentication setup.
- Formula-based pricing (E2B) never becomes stale.
- Custom pricing for Docker/K8s supports internal chargeback models.

**Negative:**

- Allowlists must be manually maintained when new instance generations launch.
- GCP's per-resource pricing model requires price reconstruction, which may drift from actual GCP calculator results due to sustained use discounts and committed use discounts not being modeled.
- Maintainers must configure API keys for Fly, RunPod, Northflank, and GCP to get live pricing.

**Neutral:**

- Static fallback data always available regardless of API key configuration.
- DevPod's delegation model means its catalog quality depends on the underlying provider's configuration.
