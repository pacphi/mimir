# ADR 0004: Dynamic Compute Catalog and Pricing System

**Date:** 2026-02-26
**Status:** Proposed

---

## Context

Step 3 of the deployment wizard ("Resources & Secrets") uses hardcoded VM sizes in the frontend (`MOCK_VM_SIZES`) that don't vary by provider. The backend has per-provider static data in `providers.ts` and `pricing.ts`, but none of it is fetched dynamically from cloud provider APIs. The frontend doesn't call the existing `GET /api/v1/providers/:provider/vm-sizes` endpoint — it ignores it entirely.

This creates several problems:

- **Pricing drift**: Static prices become stale as providers update their rates.
- **Incomplete offerings**: New VM sizes, GPU types, or regions aren't reflected without code changes.
- **Provider blindness**: All providers show the same generic sizes, not their actual catalog.
- **No cost visibility**: Users can't see real cost estimates before deploying.

---

## Decision

Introduce a `CatalogService` that fetches compute sizes and pricing from each provider's API, caches the data in Redis with configurable TTLs, and falls back to static data when APIs are unavailable.

### Architecture

```
Frontend → GET /providers/:provider/compute-catalog → Redis Cache → CatalogService → Provider Fetchers
```

### Provider API Strategy

| Provider   | API Type      | Auth Required | Pricing Model                   |
| ---------- | ------------- | ------------- | ------------------------------- |
| Fly.io     | GraphQL       | Bearer token  | Per-preset (priceMonth)         |
| RunPod     | GraphQL       | API key       | Per-GPU (securePrice)           |
| Northflank | REST          | Bearer token  | Per-plan (monthly/hourly)       |
| AWS        | Public JSON   | None          | Per-instance-type (on-demand)   |
| GCP        | Billing API   | API key       | Per-resource (CPU + RAM)        |
| Azure      | Retail Prices | None          | Per-SKU (retailPrice/hr)        |
| E2B        | Formula       | None          | $0.0504/vCPU/hr + $0.0162/GB/hr |
| Docker     | Static        | None          | Maintainer-configurable         |
| Kubernetes | Static        | None          | Maintainer-configurable         |
| DevPod     | Delegates     | Cloud creds   | Underlying provider rates       |

### Caching & Fallback Strategy

- **Redis cache keys**: `catalog:{provider}` with per-provider TTLs
- **Fallback chain**: Redis cache → live API fetch → static fallback (existing `pricing.ts` data)
- **Stale-while-revalidate**: If API fetch fails, return cached data even if expired (with `source: "cached"` flag), or static fallback with `source: "fallback"`
- **Refresh worker**: Runs every 4 hours, pre-populates cache for all enabled providers on startup

### Configuration Model

Fetcher behavior is configurable per provider via:

- `CATALOG_CONFIG` env var pointing to a JSON file
- Individual env vars: `CATALOG_{PROVIDER}_TTL`, `CATALOG_{PROVIDER}_INTERVAL_MS`, `CATALOG_{PROVIDER}_ENABLED`
- API key env vars per provider (e.g., `PRICING_FLY_API_TOKEN`, `PRICING_RUNPOD_API_KEY`)

---

## Consequences

**Positive:**

- Users see real provider offerings with live pricing in Step 3.
- Pricing stays current without code deployments.
- Maintainers can configure which providers are enabled and their refresh schedules.
- Graceful degradation: static fallback data always available.
- GPU availability information from RunPod helps users choose available hardware.

**Negative:**

- Requires API keys for authenticated providers (Fly, RunPod, Northflank, GCP) to get live data.
- Adds ~15 new files to the codebase.
- Redis becomes a harder dependency for fresh pricing data (though fallback works without it).
- AWS bulk pricing JSON is large; requires curated allowlists to keep data volume manageable.

**Neutral:**

- Existing `GET /api/v1/providers/:provider/vm-sizes` endpoint preserved as deprecated alias.
- Static pricing data in `pricing.ts` remains as the fallback source; not deleted.
- Docker and Kubernetes providers always show $0 pricing by default (maintainer-configurable).
