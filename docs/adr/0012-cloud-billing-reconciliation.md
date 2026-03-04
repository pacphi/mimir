# ADR 0012: Cloud Billing Reconciliation and FOCUS 1.3 Normalization

- **Status:** Accepted
- **Date:** 2026-03-03
- **Deciders:** Core team

## Context

Mimir's cost tracking uses static pricing tables to estimate daily infrastructure costs. While functional, these estimates can diverge from actual cloud billing by 20%+ due to:

- Spot/preemptible pricing discounts not reflected in static tables
- Sustained-use discounts (GCP) and reserved instance pricing (AWS/Azure)
- Network egress estimates based on single metric snapshots
- Provider price changes between static table updates

Cloud providers offer billing APIs with actual spend data, though with varying delays (minutes to 48 hours).

## Decision

### 1. Cloud Cost Collector Service

A new service (`cloud-cost-collector.ts`) that fetches actual billing data from cloud provider APIs:

| Provider       | API                                                        | Auth            | Granularity    | Delay   |
| -------------- | ---------------------------------------------------------- | --------------- | -------------- | ------- |
| **RunPod**     | GraphQL `myself { currentSpendPerHr, pods { costPerHr } }` | API key         | Near-real-time | Minutes |
| **Northflank** | REST `/v1/billing/spending`                                | Bearer token    | Near-real-time | Minutes |
| **AWS**        | Cost Explorer `GetCostAndUsage`                            | IAM credentials | Daily          | 8-24h   |
| **GCP**        | BigQuery billing export                                    | Service account | Hourly         | 1-48h   |
| **Azure**      | Cost Management Query API                                  | Azure AD SP     | Daily          | 4-24h   |
| **Fly.io**     | None available                                             | —               | —              | —       |

AWS, GCP, and Azure SDKs are dynamically imported — they're only loaded if the SDK is installed and credentials are configured. This avoids mandatory npm dependencies for cloud SDKs.

### 2. FOCUS 1.3 Normalization

All billing data is normalized to the [FOCUS (FinOps Open Cost and Usage Specification)](https://focus.finops.org/) format:

```typescript
interface NormalizedCostRecord {
  billingPeriodStart: string;
  billingPeriodEnd: string;
  chargePeriodStart: string;
  chargePeriodEnd: string;
  serviceCategory: "Compute" | "Storage" | "Network" | "AI" | "Other";
  provider: string;
  resourceId: string;
  resourceName?: string;
  effectiveCost: number;
  billedCost: number;
  currency: string;
  source: "estimated" | "actual" | "reconciled";
  tags?: Record<string, string>;
}
```

The `serviceCategory: "AI"` value integrates LLM costs (ADR-0011) into the FOCUS framework.

### 3. Reconciliation in Cost Worker

The daily cost worker now includes a reconciliation step:

1. Fetch actual billing data from all configured cloud providers (2-day lookback for billing delays)
2. Compare actual totals against estimated `CostEntry` records
3. Update `CostEntry.source` from `"estimated"` to `"reconciled"`
4. Store variance data in `CostEntry.metadata`: `{ reconciled_at, actual_total_usd, estimated_total_usd, variance_pct }`
5. Log warnings when variance exceeds 20%

### 4. CostEntry `source` field

New column tracking data provenance:

- `"estimated"` — from static pricing tables (default)
- `"actual"` — from cloud billing API
- `"reconciled"` — estimated entry updated with actual billing data

## Consequences

### Positive

- Operators can see whether cost data reflects actual or estimated spend
- Variance tracking identifies where static pricing is most inaccurate
- FOCUS normalization enables future integration with FinOps tools
- Dynamic SDK imports mean no mandatory cloud dependencies

### Negative

- Fly.io costs remain estimated — no billing API exists
- Billing data delays (up to 48h for GCP) mean reconciliation is not real-time
- AWS/GCP/Azure SDKs add significant optional dependency weight

### Files changed

**New:**

- `apps/api/src/services/costs/cloud-cost-collector.ts`

**Modified:**

- `apps/api/prisma/schema.prisma` — `source` column on `CostEntry`
- `apps/api/src/workers/cost.worker.ts` — reconciliation step
- `packages/protocol/src/index.ts` — `NormalizedCostRecord`, `FocusServiceCategory`
