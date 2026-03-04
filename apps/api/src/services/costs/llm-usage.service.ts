/**
 * LLM usage service — ingest, query, and aggregate LLM token usage data.
 */

import { db } from "../../lib/db.js";
import { computeLlmCost } from "./llm-pricing.js";
import type { LlmUsageRecord } from "../../websocket/channels.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LlmCostSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  byProvider: Array<{
    provider: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  byModel: Array<{
    provider: string;
    model: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  byInstance: Array<{
    instanceId: string;
    instanceName: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  periodStart: string;
  periodEnd: string;
}

export interface LlmCostTrendPoint {
  date: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ingest a batch of LLM usage records from a Draupnir agent.
 */
export async function ingestLlmUsageBatch(
  instanceId: string,
  records: LlmUsageRecord[],
): Promise<number> {
  if (records.length === 0) return 0;

  const data = records.map((r) => ({
    instance_id: instanceId,
    timestamp: new Date(r.ts),
    provider: r.provider,
    model: r.model,
    operation: r.operation ?? null,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    cache_read_tokens: r.cacheReadTokens ?? null,
    cache_write_tokens: r.cacheWriteTokens ?? null,
    cost_usd:
      r.costUsd > 0
        ? r.costUsd
        : computeLlmCost(
            r.provider,
            r.model,
            r.inputTokens,
            r.outputTokens,
            r.cacheReadTokens ?? 0,
            r.cacheWriteTokens ?? 0,
          ),
    source: "agent",
    capture_tier: r.captureTier ?? null,
    trace_id: r.traceId ?? null,
  }));

  const result = await db.llmUsageEntry.createMany({ data });
  return result.count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query — Summary
// ─────────────────────────────────────────────────────────────────────────────

export async function getLlmCostSummary(
  from: Date,
  to: Date,
  instanceId?: string,
  provider?: string,
): Promise<LlmCostSummary> {
  const where = {
    timestamp: { gte: from, lte: to },
    ...(instanceId ? { instance_id: instanceId } : {}),
    ...(provider ? { provider } : {}),
  };

  const entries = await db.llmUsageEntry.findMany({
    where,
    include: { instance: { select: { id: true, name: true } } },
  });

  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;

  const providerMap = new Map<
    string,
    { costUsd: number; inputTokens: number; outputTokens: number }
  >();
  const modelMap = new Map<
    string,
    { provider: string; model: string; costUsd: number; inputTokens: number; outputTokens: number }
  >();
  const instanceMap = new Map<
    string,
    { instanceName: string; costUsd: number; inputTokens: number; outputTokens: number }
  >();

  for (const e of entries) {
    totalCostUsd += e.cost_usd;
    totalInputTokens += e.input_tokens;
    totalOutputTokens += e.output_tokens;
    totalCacheReadTokens += e.cache_read_tokens ?? 0;
    totalCacheWriteTokens += e.cache_write_tokens ?? 0;

    // By provider
    const pKey = e.provider;
    const prev = providerMap.get(pKey) ?? { costUsd: 0, inputTokens: 0, outputTokens: 0 };
    providerMap.set(pKey, {
      costUsd: prev.costUsd + e.cost_usd,
      inputTokens: prev.inputTokens + e.input_tokens,
      outputTokens: prev.outputTokens + e.output_tokens,
    });

    // By model
    const mKey = `${e.provider}/${e.model}`;
    const prevM = modelMap.get(mKey) ?? {
      provider: e.provider,
      model: e.model,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    modelMap.set(mKey, {
      provider: e.provider,
      model: e.model,
      costUsd: prevM.costUsd + e.cost_usd,
      inputTokens: prevM.inputTokens + e.input_tokens,
      outputTokens: prevM.outputTokens + e.output_tokens,
    });

    // By instance
    const iKey = e.instance_id;
    const prevI = instanceMap.get(iKey) ?? {
      instanceName: e.instance.name,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    instanceMap.set(iKey, {
      instanceName: e.instance.name,
      costUsd: prevI.costUsd + e.cost_usd,
      inputTokens: prevI.inputTokens + e.input_tokens,
      outputTokens: prevI.outputTokens + e.output_tokens,
    });
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    totalCostUsd: round(totalCostUsd),
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    byProvider: Array.from(providerMap.entries())
      .map(([provider, v]) => ({
        provider,
        costUsd: round(v.costUsd),
        inputTokens: v.inputTokens,
        outputTokens: v.outputTokens,
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byModel: Array.from(modelMap.values())
      .map((v) => ({ ...v, costUsd: round(v.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byInstance: Array.from(instanceMap.entries())
      .map(([instanceId, v]) => ({
        instanceId,
        instanceName: v.instanceName,
        costUsd: round(v.costUsd),
        inputTokens: v.inputTokens,
        outputTokens: v.outputTokens,
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
    periodStart: from.toISOString(),
    periodEnd: to.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Query — Trends (daily)
// ─────────────────────────────────────────────────────────────────────────────

export async function getLlmCostTrends(
  from: Date,
  to: Date,
  instanceId?: string,
  provider?: string,
): Promise<LlmCostTrendPoint[]> {
  const where = {
    timestamp: { gte: from, lte: to },
    ...(instanceId ? { instance_id: instanceId } : {}),
    ...(provider ? { provider } : {}),
  };

  const entries = await db.llmUsageEntry.findMany({ where, orderBy: { timestamp: "asc" } });

  const buckets = new Map<string, { costUsd: number; inputTokens: number; outputTokens: number }>();

  for (const e of entries) {
    const day = e.timestamp.toISOString().slice(0, 10);
    const prev = buckets.get(day) ?? { costUsd: 0, inputTokens: 0, outputTokens: 0 };
    buckets.set(day, {
      costUsd: prev.costUsd + e.cost_usd,
      inputTokens: prev.inputTokens + e.input_tokens,
      outputTokens: prev.outputTokens + e.output_tokens,
    });
  }

  return Array.from(buckets.entries()).map(([date, v]) => ({
    date,
    costUsd: Math.round(v.costUsd * 100) / 100,
    inputTokens: v.inputTokens,
    outputTokens: v.outputTokens,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Query — Per-instance LLM costs
// ─────────────────────────────────────────────────────────────────────────────

export async function getLlmCostByInstance(
  instanceId: string,
  from: Date,
  to: Date,
): Promise<{
  models: Array<{
    provider: string;
    model: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}> {
  const entries = await db.llmUsageEntry.findMany({
    where: { instance_id: instanceId, timestamp: { gte: from, lte: to } },
  });

  const modelMap = new Map<
    string,
    { provider: string; model: string; costUsd: number; inputTokens: number; outputTokens: number }
  >();
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const e of entries) {
    totalCostUsd += e.cost_usd;
    totalInputTokens += e.input_tokens;
    totalOutputTokens += e.output_tokens;

    const key = `${e.provider}/${e.model}`;
    const prev = modelMap.get(key) ?? {
      provider: e.provider,
      model: e.model,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    modelMap.set(key, {
      provider: e.provider,
      model: e.model,
      costUsd: prev.costUsd + e.cost_usd,
      inputTokens: prev.inputTokens + e.input_tokens,
      outputTokens: prev.outputTokens + e.output_tokens,
    });
  }

  return {
    models: Array.from(modelMap.values())
      .map((v) => ({ ...v, costUsd: Math.round(v.costUsd * 100) / 100 }))
      .sort((a, b) => b.costUsd - a.costUsd),
    totalCostUsd: Math.round(totalCostUsd * 100) / 100,
    totalInputTokens,
    totalOutputTokens,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation — daily LLM cost for cost worker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate LLM costs per instance for a given day, for use by the cost worker.
 * Returns a map of instanceId → daily LLM cost USD.
 */
export async function aggregateDailyLlmCosts(
  periodStart: Date,
  periodEnd: Date,
): Promise<Map<string, number>> {
  const entries = await db.llmUsageEntry.findMany({
    where: { timestamp: { gte: periodStart, lte: periodEnd } },
    select: { instance_id: true, cost_usd: true },
  });

  const result = new Map<string, number>();
  for (const e of entries) {
    result.set(e.instance_id, (result.get(e.instance_id) ?? 0) + e.cost_usd);
  }

  return result;
}
