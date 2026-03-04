import { useQuery } from "@tanstack/react-query";
import { llmCostsApi } from "@/api/llm-costs";
import { costDateRange, type CostDateRange } from "@/hooks/useCosts";

export function useLlmCostSummary(range: CostDateRange, provider?: string) {
  const { from, to } = costDateRange(range);
  return useQuery({
    queryKey: ["costs", "llm", "summary", range, provider],
    queryFn: () => llmCostsApi.summary({ from, to, provider }),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

export function useLlmCostTrends(range: CostDateRange, provider?: string) {
  const { from, to } = costDateRange(range);
  return useQuery({
    queryKey: ["costs", "llm", "trends", range, provider],
    queryFn: () => llmCostsApi.trends({ from, to, provider }),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

export function useLlmInstanceDetail(instanceId: string, range: CostDateRange) {
  const { from, to } = costDateRange(range);
  return useQuery({
    queryKey: ["costs", "llm", "instance", instanceId, range],
    queryFn: () => llmCostsApi.instanceDetail(instanceId, { from, to }),
    staleTime: 5 * 60_000,
    enabled: !!instanceId,
  });
}
