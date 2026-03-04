import { useLlmCostSummary, useLlmCostTrends } from "@/hooks/useLlmCosts";
import type { CostDateRange } from "@/hooks/useCosts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

function formatUsd(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#d97706",
  openai: "#10b981",
  google: "#3b82f6",
  groq: "#8b5cf6",
  mistral: "#f43f5e",
  xai: "#6366f1",
  cohere: "#14b8a6",
  ollama: "#64748b",
  bedrock: "#f59e0b",
  together: "#ec4899",
  other: "#94a3b8",
};

function getColor(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] ?? PROVIDER_COLORS.other;
}

interface Props {
  range: CostDateRange;
  className?: string;
}

export function LlmCostDashboard({ range, className }: Props) {
  const { data: summary, isLoading: summaryLoading } = useLlmCostSummary(range);
  const { data: trends } = useLlmCostTrends(range);

  const hasData = summary && summary.totalCostUsd > 0;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">LLM Spend</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="h-7 w-20 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-semibold">{formatUsd(summary?.totalCostUsd ?? 0)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Input Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatTokens(summary?.totalInputTokens ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Output Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatTokens(summary?.totalOutputTokens ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Providers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary?.byProvider?.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {hasData && (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
          {/* Token usage over time */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">LLM Cost Trend</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends?.points ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} className="text-xs" />
                  <YAxis tickFormatter={(v) => `$${v}`} className="text-xs" />
                  <Tooltip
                    formatter={(value) => formatUsd(Number(value))}
                    labelFormatter={(d) => `Date: ${d}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="costUsd"
                    stroke="#d97706"
                    fill="#d97706"
                    fillOpacity={0.15}
                    name="LLM Cost"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cost by provider (pie) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cost by Provider</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={(summary?.byProvider ?? []).map((p) => ({
                      name: p.provider,
                      value: p.costUsd,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  >
                    {(summary?.byProvider ?? []).map((p) => (
                      <Cell key={p.provider} fill={getColor(p.provider)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatUsd(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top models table */}
      {hasData && summary.byModel.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cost by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.byModel.slice(0, 10).map((m) => {
                const pct = summary.totalCostUsd > 0 ? (m.costUsd / summary.totalCostUsd) * 100 : 0;
                return (
                  <div key={`${m.provider}/${m.model}`}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1.5"
                          style={{ backgroundColor: getColor(m.provider) }}
                        />
                        {m.model}
                      </span>
                      <div className="flex gap-3">
                        <span className="text-muted-foreground">
                          {formatTokens(m.inputTokens)} in / {formatTokens(m.outputTokens)} out
                        </span>
                        <span className="font-semibold w-16 text-right">
                          {formatUsd(m.costUsd)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          backgroundColor: getColor(m.provider),
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top instances table */}
      {hasData && summary.byInstance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">LLM Cost by Instance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.byInstance.slice(0, 10).map((inst) => (
                <div
                  key={inst.instanceId}
                  className="flex justify-between text-xs py-1.5 border-b last:border-0"
                >
                  <span className="font-medium">{inst.instanceName}</span>
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">
                      {formatTokens(inst.inputTokens + inst.outputTokens)} tokens
                    </span>
                    <span className="font-semibold w-16 text-right">{formatUsd(inst.costUsd)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!summaryLoading && !hasData && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No LLM usage data yet. LLM token costs will appear here once Draupnir agents begin
            reporting usage from your fleet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
