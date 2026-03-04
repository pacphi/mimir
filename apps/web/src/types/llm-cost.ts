// ─────────────────────────────────────────────────────────────────────────────
// LLM cost tracking types
// ─────────────────────────────────────────────────────────────────────────────

export interface LlmCostSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  byProvider: LlmProviderCost[];
  byModel: LlmModelCost[];
  byInstance: LlmInstanceCost[];
  periodStart: string;
  periodEnd: string;
}

export interface LlmProviderCost {
  provider: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmModelCost {
  provider: string;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmInstanceCost {
  instanceId: string;
  instanceName: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCostTrendPoint {
  date: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCostTrendsResponse {
  points: LlmCostTrendPoint[];
}

export interface LlmInstanceDetail {
  models: LlmModelCost[];
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface LlmModelPricing {
  provider: string;
  model: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

export interface LlmPricingResponse {
  models: LlmModelPricing[];
}
