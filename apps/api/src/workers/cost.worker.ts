/**
 * Cost calculation worker.
 *
 * Runs daily (every 24 hours) to:
 *   1. Calculate and record daily cost entries for all active instances
 *   2. Aggregate daily LLM token costs into CostEntry.llm_usd
 *   3. Reconcile estimated costs with actual cloud billing data
 *   4. Run right-sizing analysis and update recommendations
 *   5. Evaluate budget thresholds and trigger alerts
 *
 * Intentionally uses the same setInterval pattern as the alert evaluation
 * and metric aggregation workers — no BullMQ dependency required.
 */

import { logger } from "../lib/logger.js";
import { db } from "../lib/db.js";
import { recordCostEntry } from "../services/costs/cost.service.js";
import { analyzeAndGenerateRecommendations } from "../services/costs/rightsizing.service.js";
import { evaluateBudgetAlerts } from "../services/costs/budget.service.js";
import { estimateMonthlyCost, getProviderPricing } from "../services/costs/pricing.js";
import { aggregateDailyLlmCosts } from "../services/costs/llm-usage.service.js";
import { fetchAllCloudCosts } from "../services/costs/cloud-cost-collector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Worker state
// ─────────────────────────────────────────────────────────────────────────────

const WORKER_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let workerTimer: NodeJS.Timeout | null = null;
let isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Worker lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export function startCostWorker(): void {
  if (workerTimer !== null) {
    logger.warn("Cost worker already started");
    return;
  }

  logger.info({ intervalMs: WORKER_INTERVAL_MS }, "Cost worker started");

  // Run once immediately on startup (async — non-blocking)
  void runCostCycle();

  workerTimer = setInterval(() => void runCostCycle(), WORKER_INTERVAL_MS);
}

export function stopCostWorker(): void {
  if (workerTimer !== null) {
    clearInterval(workerTimer);
    workerTimer = null;
    logger.info("Cost worker stopped");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main cycle
// ─────────────────────────────────────────────────────────────────────────────

async function runCostCycle(): Promise<void> {
  if (isRunning) {
    logger.debug("Skipping cost cycle — previous run still in progress");
    return;
  }

  isRunning = true;
  const start = Date.now();

  try {
    logger.info("Cost worker cycle starting");

    const [costResult, llmResult, reconcileResult, rsResult, budgetAlerts] =
      await Promise.allSettled([
        recordDailyCosts(),
        aggregateLlmCostsIntoCostEntries(),
        reconcileWithCloudBilling(),
        analyzeAndGenerateRecommendations(),
        evaluateBudgetAlerts(),
      ]);

    if (costResult.status === "fulfilled") {
      logger.info(costResult.value, "Daily cost entries recorded");
    } else {
      logger.error({ err: costResult.reason }, "Failed to record daily costs");
    }

    if (llmResult.status === "fulfilled") {
      logger.info(llmResult.value, "LLM costs aggregated into cost entries");
    } else {
      logger.error({ err: llmResult.reason }, "Failed to aggregate LLM costs");
    }

    if (reconcileResult.status === "fulfilled") {
      logger.info(reconcileResult.value, "Cloud billing reconciliation complete");
    } else {
      logger.error({ err: reconcileResult.reason }, "Failed to reconcile cloud billing");
    }

    if (rsResult.status === "fulfilled") {
      logger.info(rsResult.value, "Right-sizing analysis complete");
    } else {
      logger.error({ err: rsResult.reason }, "Failed to run right-sizing analysis");
    }

    if (budgetAlerts.status === "fulfilled") {
      if (budgetAlerts.value.length > 0) {
        logger.warn({ alerts: budgetAlerts.value }, "Budget thresholds breached");
      }
    } else {
      logger.error({ err: budgetAlerts.reason }, "Failed to evaluate budget alerts");
    }

    const durationMs = Date.now() - start;
    logger.info({ durationMs }, "Cost worker cycle complete");
  } catch (err) {
    logger.error({ err }, "Cost worker cycle failed");
  } finally {
    isRunning = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily cost recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all active instances and record a daily cost entry for each.
 * Estimates cost from provider pricing tables using the latest disk metrics.
 * Skips instances that already have a cost entry for today.
 */
async function recordDailyCosts(): Promise<{ recorded: number; skipped: number; failed: number }> {
  const periodStart = startOfDay(new Date());
  const periodEnd = endOfDay(new Date());

  const instances = await db.instance.findMany({
    where: { status: { in: ["RUNNING", "STOPPED", "SUSPENDED"] } },
    select: {
      id: true,
      name: true,
      provider: true,
      metrics: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: {
          disk_used: true,
          disk_total: true,
          net_bytes_sent: true,
          net_bytes_recv: true,
        },
      },
      cost_entries: {
        where: { period_start: { gte: periodStart } },
        take: 1,
        select: { id: true },
      },
    },
  });

  let recorded = 0;
  let skipped = 0;
  let failed = 0;

  for (const inst of instances) {
    // Already recorded today
    if (inst.cost_entries.length > 0) {
      skipped++;
      continue;
    }

    const pricing = getProviderPricing(inst.provider);
    if (!pricing) {
      logger.debug(
        { provider: inst.provider, instanceId: inst.id },
        "No pricing table for provider — skipping",
      );
      skipped++;
      continue;
    }

    try {
      // Use the middle tier as a default when we don't have tier metadata
      const defaultTierIdx = Math.floor(pricing.computeTiers.length / 2);
      const tier = pricing.computeTiers[defaultTierIdx];

      const latestMetric = inst.metrics[0];
      const diskGb = latestMetric ? Math.round(Number(latestMetric.disk_total) / 1024 ** 3) : 20; // default 20 GB

      // Estimate monthly egress from last metric (bytes → GB)
      const egressBytes = latestMetric ? Number(latestMetric.net_bytes_sent ?? 0n) : 0;
      const egressGbMonth = Math.round((egressBytes * 30) / 1024 ** 3);

      const monthly = estimateMonthlyCost(inst.provider, tier.id, diskGb, egressGbMonth);
      if (!monthly) {
        skipped++;
        continue;
      }

      // Pro-rate monthly to daily
      const computeUsd = round2(monthly.compute / 30);
      const storageUsd = round2(monthly.storage / 30);
      const networkUsd = round2(monthly.network / 30);

      await recordCostEntry({
        instanceId: inst.id,
        provider: inst.provider,
        periodStart,
        periodEnd,
        computeUsd,
        storageUsd,
        networkUsd,
        metadata: {
          tier: tier.id,
          diskGb,
          egressGbMonth,
          source: "cost-worker",
        },
      });

      recorded++;
    } catch (err) {
      logger.error({ err, instanceId: inst.id }, "Failed to record cost entry for instance");
      failed++;
    }
  }

  return { recorded, skipped, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM cost aggregation — merge daily LLM costs into CostEntry.llm_usd
// ─────────────────────────────────────────────────────────────────────────────

async function aggregateLlmCostsIntoCostEntries(): Promise<{ updated: number }> {
  const periodStart = startOfDay(new Date());
  const periodEnd = endOfDay(new Date());

  const llmCosts = await aggregateDailyLlmCosts(periodStart, periodEnd);
  if (llmCosts.size === 0) return { updated: 0 };

  let updated = 0;

  for (const [instanceId, llmUsd] of llmCosts) {
    try {
      // Find today's cost entry for this instance
      const entry = await db.costEntry.findFirst({
        where: { instance_id: instanceId, period_start: { gte: periodStart } },
        select: {
          id: true,
          total_usd: true,
          compute_usd: true,
          storage_usd: true,
          network_usd: true,
        },
      });

      if (entry) {
        // Update existing entry with LLM cost
        const newTotal = round2(entry.compute_usd + entry.storage_usd + entry.network_usd + llmUsd);
        await db.costEntry.update({
          where: { id: entry.id },
          data: { llm_usd: round2(llmUsd), total_usd: newTotal },
        });
        updated++;
      }
      // If no cost entry exists yet (instance may not have infra pricing),
      // we still don't create one — LLM-only cost entries could be added later
    } catch (err) {
      logger.warn({ err, instanceId }, "Failed to update LLM cost for instance");
    }
  }

  return { updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud billing reconciliation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch actual billing data from cloud providers and reconcile with estimates.
 * Updates CostEntry metadata with source and variance information.
 */
async function reconcileWithCloudBilling(): Promise<{ reconciled: number; providers: string[] }> {
  const periodStart = startOfDay(new Date());
  // Look back 2 days to account for billing data delays
  const lookbackStart = new Date(periodStart);
  lookbackStart.setDate(lookbackStart.getDate() - 2);
  const periodEnd = endOfDay(new Date());

  let reconciled = 0;
  const providers: string[] = [];

  try {
    const cloudCosts = await fetchAllCloudCosts(lookbackStart, periodEnd);

    for (const result of cloudCosts) {
      providers.push(result.provider);

      // Sum actual costs by resource for this provider
      const totalActual = result.records.reduce((sum, r) => sum + r.effectiveCost, 0);

      // Find estimated entries for this provider in the lookback window
      const estimatedEntries = await db.costEntry.findMany({
        where: {
          provider: result.provider,
          period_start: { gte: lookbackStart },
          period_end: { lte: periodEnd },
          source: "estimated",
        },
      });

      if (estimatedEntries.length === 0) continue;

      const totalEstimated = estimatedEntries.reduce((sum, e) => e.total_usd + sum, 0);
      const variancePct =
        totalEstimated > 0 ? round2(((totalActual - totalEstimated) / totalEstimated) * 100) : 0;

      // Update entries with reconciliation metadata
      for (const entry of estimatedEntries) {
        const existingMeta = (entry.metadata as Record<string, unknown>) ?? {};
        await db.costEntry.update({
          where: { id: entry.id },
          data: {
            source: "reconciled",
            metadata: {
              ...existingMeta,
              reconciled_at: new Date().toISOString(),
              actual_total_usd: round2(totalActual),
              estimated_total_usd: round2(totalEstimated),
              variance_pct: variancePct,
              cloud_billing_source: result.provider,
            },
          },
        });
        reconciled++;
      }

      // Log variance warning if > 20%
      if (Math.abs(variancePct) > 20) {
        logger.warn(
          { provider: result.provider, variancePct, totalActual, totalEstimated },
          "Cost variance exceeds 20% threshold",
        );
      }
    }
  } catch (err) {
    logger.warn({ err }, "Cloud billing reconciliation failed");
  }

  return { reconciled, providers };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
