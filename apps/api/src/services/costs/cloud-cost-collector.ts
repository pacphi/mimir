/**
 * Cloud cost collector — fetches actual billing data from cloud provider APIs.
 *
 * Each provider has a different API for billing data:
 *   - AWS: Cost Explorer GetCostAndUsage (8-24h delay)
 *   - GCP: BigQuery billing export (1-48h delay)
 *   - Azure: Cost Management Query API (4-24h delay)
 *   - RunPod: GraphQL myself { currentSpendPerHr } (near-real-time)
 *   - Northflank: REST /v1/billing/spending (near-real-time)
 *   - Fly.io: No billing API available — estimate only
 *
 * Credentials are resolved via the credential-resolver (env → vault → undefined).
 * Providers without credentials are silently skipped.
 */

import { logger } from "../../lib/logger.js";
import { resolveProviderKey } from "../../lib/credential-resolver.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types (aligned with FOCUS 1.3)
// ─────────────────────────────────────────────────────────────────────────────

type FocusServiceCategory = "Compute" | "Storage" | "Network" | "AI" | "Other";

export interface NormalizedCostRecord {
  billingPeriodStart: string;
  billingPeriodEnd: string;
  chargePeriodStart: string;
  chargePeriodEnd: string;
  serviceCategory: FocusServiceCategory;
  provider: string;
  resourceId: string;
  resourceName?: string;
  effectiveCost: number;
  billedCost: number;
  currency: string;
  source: "estimated" | "actual" | "reconciled";
}

export interface CloudCostResult {
  provider: string;
  records: NormalizedCostRecord[];
  fetchedAt: string;
  source: "actual";
}

interface ProviderBillingFetcher {
  provider: string;
  envVarName?: string;
  fetch: (credential: string | undefined, from: Date, to: Date) => Promise<NormalizedCostRecord[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// RunPod billing fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function fetchRunPodBilling(
  credential: string | undefined,
  _from: Date,
  _to: Date,
): Promise<NormalizedCostRecord[]> {
  if (!credential) return [];

  try {
    const res = await fetch("https://api.runpod.io/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential}`,
      },
      body: JSON.stringify({
        query: `query { myself { currentSpendPerHr totalSpend pods { id name costPerHr } } }`,
      }),
    });

    if (!res.ok) return [];

    const body = (await res.json()) as {
      data?: {
        myself?: {
          currentSpendPerHr?: number;
          totalSpend?: number;
          pods?: Array<{ id: string; name: string; costPerHr: number }>;
        };
      };
    };

    const myself = body.data?.myself;
    if (!myself?.pods) return [];

    return myself.pods.map((pod) => ({
      billingPeriodStart: _from.toISOString(),
      billingPeriodEnd: _to.toISOString(),
      chargePeriodStart: _from.toISOString(),
      chargePeriodEnd: _to.toISOString(),
      serviceCategory: "Compute" as FocusServiceCategory,
      provider: "runpod",
      resourceId: pod.id,
      resourceName: pod.name,
      effectiveCost: Math.round(pod.costPerHr * 24 * 100) / 100, // daily estimate from hourly
      billedCost: Math.round(pod.costPerHr * 24 * 100) / 100,
      currency: "USD",
      source: "actual" as const,
    }));
  } catch (err) {
    logger.warn({ err }, "Failed to fetch RunPod billing data");
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Northflank billing fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function fetchNorthflankBilling(
  credential: string | undefined,
  from: Date,
  to: Date,
): Promise<NormalizedCostRecord[]> {
  if (!credential) return [];

  try {
    const res = await fetch("https://api.northflank.com/v1/billing/spending", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) return [];

    const body = (await res.json()) as {
      data?: {
        services?: Array<{
          id: string;
          name: string;
          totalCost: number;
        }>;
      };
    };

    if (!body.data?.services) return [];

    return body.data.services.map((svc) => ({
      billingPeriodStart: from.toISOString(),
      billingPeriodEnd: to.toISOString(),
      chargePeriodStart: from.toISOString(),
      chargePeriodEnd: to.toISOString(),
      serviceCategory: "Compute" as FocusServiceCategory,
      provider: "northflank",
      resourceId: svc.id,
      resourceName: svc.name,
      effectiveCost: svc.totalCost,
      billedCost: svc.totalCost,
      currency: "USD",
      source: "actual" as const,
    }));
  } catch (err) {
    logger.warn({ err }, "Failed to fetch Northflank billing data");
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AWS Cost Explorer fetcher (uses public SDK — optional dependency)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAwsBilling(
  _credential: string | undefined,
  from: Date,
  to: Date,
): Promise<NormalizedCostRecord[]> {
  // AWS Cost Explorer requires IAM credentials (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)
  // Check for SDK availability at runtime
  const hasAwsKey = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
  if (!hasAwsKey) return [];

  try {
    // Dynamic import — only loaded if AWS SDK is installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const awsMod = (await import("@aws-sdk/client-cost-explorer" as any)) as any;
    const { CostExplorerClient, GetCostAndUsageCommand } = awsMod;

    const client = new CostExplorerClient({});
    const cmd = new GetCostAndUsageCommand({
      TimePeriod: {
        Start: from.toISOString().slice(0, 10),
        End: to.toISOString().slice(0, 10),
      },
      Granularity: "DAILY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
    });

    const result = await client.send(cmd);
    const records: NormalizedCostRecord[] = [];

    for (const group of result.ResultsByTime ?? []) {
      for (const g of group.Groups ?? []) {
        const serviceName = g.Keys?.[0] ?? "Unknown";
        const cost = parseFloat(g.Metrics?.UnblendedCost?.Amount ?? "0");
        if (cost <= 0) continue;

        let category: FocusServiceCategory = "Other";
        if (serviceName.includes("EC2") || serviceName.includes("Fargate")) category = "Compute";
        else if (serviceName.includes("S3") || serviceName.includes("EBS")) category = "Storage";
        else if (serviceName.includes("CloudFront") || serviceName.includes("Transfer"))
          category = "Network";
        else if (serviceName.includes("Bedrock") || serviceName.includes("SageMaker"))
          category = "AI";

        records.push({
          billingPeriodStart: from.toISOString(),
          billingPeriodEnd: to.toISOString(),
          chargePeriodStart: group.TimePeriod?.Start ?? from.toISOString(),
          chargePeriodEnd: group.TimePeriod?.End ?? to.toISOString(),
          serviceCategory: category,
          provider: "aws",
          resourceId: serviceName,
          resourceName: serviceName,
          effectiveCost: Math.round(cost * 100) / 100,
          billedCost: Math.round(cost * 100) / 100,
          currency: "USD",
          source: "actual",
        });
      }
    }

    return records;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch AWS billing data");
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GCP BigQuery billing fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function fetchGcpBilling(
  _credential: string | undefined,
  from: Date,
  to: Date,
): Promise<NormalizedCostRecord[]> {
  const projectId = process.env.GCP_BILLING_PROJECT_ID;
  const datasetId = process.env.GCP_BILLING_DATASET_ID;
  if (!projectId || !datasetId) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { BigQuery } = (await import("@google-cloud/bigquery" as any)) as any;
    const bq = new BigQuery({ projectId });

    const query = `
      SELECT
        service.description AS service_name,
        SUM(cost) AS total_cost,
        usage_start_time,
        usage_end_time
      FROM \`${projectId}.${datasetId}.gcp_billing_export_v1_*\`
      WHERE usage_start_time >= @from AND usage_end_time <= @to
      GROUP BY service_name, usage_start_time, usage_end_time
      ORDER BY total_cost DESC
      LIMIT 100
    `;

    const [rows] = await bq.query({
      query,
      params: { from: from.toISOString(), to: to.toISOString() },
    });

    return (
      rows as Array<{
        service_name: string;
        total_cost: number;
        usage_start_time: string;
        usage_end_time: string;
      }>
    ).map((row) => {
      let category: FocusServiceCategory = "Other";
      if (row.service_name.includes("Compute")) category = "Compute";
      else if (row.service_name.includes("Storage")) category = "Storage";
      else if (row.service_name.includes("Networking")) category = "Network";
      else if (row.service_name.includes("Vertex") || row.service_name.includes("AI"))
        category = "AI";

      return {
        billingPeriodStart: from.toISOString(),
        billingPeriodEnd: to.toISOString(),
        chargePeriodStart: row.usage_start_time,
        chargePeriodEnd: row.usage_end_time,
        serviceCategory: category,
        provider: "gcp",
        resourceId: row.service_name,
        resourceName: row.service_name,
        effectiveCost: Math.round(row.total_cost * 100) / 100,
        billedCost: Math.round(row.total_cost * 100) / 100,
        currency: "USD",
        source: "actual",
      };
    });
  } catch (err) {
    logger.warn({ err }, "Failed to fetch GCP billing data");
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Azure Cost Management fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAzureBilling(
  _credential: string | undefined,
  from: Date,
  to: Date,
): Promise<NormalizedCostRecord[]> {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  if (!subscriptionId) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { DefaultAzureCredential } = (await import("@azure/identity" as any)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { CostManagementClient } = (await import("@azure/arm-costmanagement" as any)) as any;

    const credential = new DefaultAzureCredential();
    const client = new CostManagementClient(credential);

    const scope = `/subscriptions/${subscriptionId}`;
    const result = await client.query.usage(scope, {
      type: "ActualCost",
      timeframe: "Custom",
      timePeriod: {
        from: from,
        to: to,
      },
      dataset: {
        granularity: "Daily",
        aggregation: {
          totalCost: { name: "Cost", function: "Sum" },
        },
        grouping: [{ type: "Dimension", name: "ServiceName" }],
      },
    });

    const records: NormalizedCostRecord[] = [];
    const columns = (result.columns ?? []) as Array<{ name: string }>;
    const costIdx = columns.findIndex((c: { name: string }) => c.name === "Cost");
    const serviceIdx = columns.findIndex((c: { name: string }) => c.name === "ServiceName");

    for (const row of result.rows ?? []) {
      const cost = Number(row[costIdx]) || 0;
      const serviceName = String(row[serviceIdx] ?? "Unknown");
      if (cost <= 0) continue;

      let category: FocusServiceCategory = "Other";
      if (serviceName.includes("Virtual Machines") || serviceName.includes("Container"))
        category = "Compute";
      else if (serviceName.includes("Storage")) category = "Storage";
      else if (serviceName.includes("Bandwidth") || serviceName.includes("Network"))
        category = "Network";
      else if (serviceName.includes("Cognitive") || serviceName.includes("OpenAI")) category = "AI";

      records.push({
        billingPeriodStart: from.toISOString(),
        billingPeriodEnd: to.toISOString(),
        chargePeriodStart: from.toISOString(),
        chargePeriodEnd: to.toISOString(),
        serviceCategory: category,
        provider: "azure",
        resourceId: serviceName,
        resourceName: serviceName,
        effectiveCost: Math.round(cost * 100) / 100,
        billedCost: Math.round(cost * 100) / 100,
        currency: "USD",
        source: "actual",
      });
    }

    return records;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch Azure billing data");
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher registry
// ─────────────────────────────────────────────────────────────────────────────

const BILLING_FETCHERS: ProviderBillingFetcher[] = [
  { provider: "runpod", envVarName: "PRICING_RUNPOD_API_KEY", fetch: fetchRunPodBilling },
  {
    provider: "northflank",
    envVarName: "PRICING_NORTHFLANK_API_TOKEN",
    fetch: fetchNorthflankBilling,
  },
  { provider: "aws", fetch: fetchAwsBilling },
  { provider: "gcp", fetch: fetchGcpBilling },
  { provider: "azure", fetch: fetchAzureBilling },
  // Fly.io: No billing API available
];

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch actual billing data from all configured cloud providers.
 * Providers without credentials are silently skipped.
 */
export async function fetchAllCloudCosts(from: Date, to: Date): Promise<CloudCostResult[]> {
  const results: CloudCostResult[] = [];

  const settled = await Promise.allSettled(
    BILLING_FETCHERS.map(async (fetcher) => {
      const credential = fetcher.envVarName
        ? await resolveProviderKey(fetcher.envVarName)
        : undefined;

      const records = await fetcher.fetch(credential, from, to);
      return { provider: fetcher.provider, records };
    }),
  );

  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.records.length > 0) {
      results.push({
        provider: result.value.provider,
        records: result.value.records,
        fetchedAt: new Date().toISOString(),
        source: "actual",
      });
    } else if (result.status === "rejected") {
      logger.warn({ err: result.reason }, "Cloud cost fetch failed");
    }
  }

  return results;
}

/**
 * Fetch actual billing data for a specific provider.
 */
export async function fetchCloudCosts(
  provider: string,
  from: Date,
  to: Date,
): Promise<CloudCostResult | null> {
  const fetcher = BILLING_FETCHERS.find((f) => f.provider === provider);
  if (!fetcher) return null;

  const credential = fetcher.envVarName ? await resolveProviderKey(fetcher.envVarName) : undefined;

  const records = await fetcher.fetch(credential, from, to);
  if (records.length === 0) return null;

  return {
    provider,
    records,
    fetchedAt: new Date().toISOString(),
    source: "actual",
  };
}
