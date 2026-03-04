import type {
  LlmCostSummary,
  LlmCostTrendsResponse,
  LlmInstanceDetail,
  LlmPricingResponse,
} from "@/types/llm-cost";
import { apiFetch } from "@/lib/api-fetch";

export const llmCostsApi = {
  summary(params: {
    from: string;
    to: string;
    instanceId?: string;
    provider?: string;
  }): Promise<LlmCostSummary> {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.instanceId) q.set("instanceId", params.instanceId);
    if (params.provider) q.set("provider", params.provider);
    return apiFetch(`/costs/llm/summary?${q.toString()}`);
  },

  trends(params: {
    from: string;
    to: string;
    instanceId?: string;
    provider?: string;
  }): Promise<LlmCostTrendsResponse> {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.instanceId) q.set("instanceId", params.instanceId);
    if (params.provider) q.set("provider", params.provider);
    return apiFetch(`/costs/llm/trends?${q.toString()}`);
  },

  instanceDetail(
    instanceId: string,
    params: { from: string; to: string },
  ): Promise<LlmInstanceDetail> {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    return apiFetch(`/costs/llm/instances/${instanceId}?${q.toString()}`);
  },

  pricing(): Promise<LlmPricingResponse> {
    return apiFetch("/costs/llm/pricing");
  },
};
