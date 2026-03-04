/**
 * OpenTelemetry OTLP HTTP receiver endpoints.
 *
 *   POST /api/v1/otel/v1/metrics   — OTLP metrics (JSON)
 *   POST /api/v1/otel/v1/traces    — OTLP traces (JSON)
 *
 * Receives OTLP JSON-encoded metrics and traces from Draupnir agents (or any
 * OTEL-compatible exporter). Extracts gen_ai.* semantic convention attributes
 * and converts them into LlmUsageEntry records.
 *
 * Optional endpoint — only active if agents are configured to export OTLP.
 * The primary ingestion path remains the WebSocket LLM_USAGE channel.
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitStrict } from "../middleware/rateLimit.js";
import { logger } from "../lib/logger.js";
import { ingestLlmUsageBatch } from "../services/costs/llm-usage.service.js";
import { computeLlmCost } from "../services/costs/llm-pricing.js";

export const otelRouter = new Hono();

otelRouter.use("*", authMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// OTLP Metrics receiver
// ─────────────────────────────────────────────────────────────────────────────

otelRouter.post("/v1/metrics", rateLimitStrict, async (c) => {
  try {
    const body = await c.req.json();
    const records = extractGenAiMetrics(body);

    if (records.length === 0) {
      return c.json({ partialSuccess: {} });
    }

    // Group by instance ID and ingest
    const byInstance = new Map<string, typeof records>();
    for (const r of records) {
      const instanceId = r.instanceId ?? "unknown";
      const existing = byInstance.get(instanceId) ?? [];
      existing.push(r);
      byInstance.set(instanceId, existing);
    }

    for (const [instanceId, batch] of byInstance) {
      await ingestLlmUsageBatch(
        instanceId,
        batch.map((r) => ({
          provider: r.provider,
          model: r.model,
          operation: r.operation,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          costUsd: r.costUsd,
          traceId: r.traceId,
          ts: r.ts,
        })),
      );
    }

    return c.json({ partialSuccess: {} });
  } catch (err) {
    logger.error({ err }, "Failed to process OTLP metrics");
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OTLP Traces receiver
// ─────────────────────────────────────────────────────────────────────────────

otelRouter.post("/v1/traces", rateLimitStrict, async (c) => {
  try {
    const body = await c.req.json();
    const records = extractGenAiSpans(body);

    if (records.length === 0) {
      return c.json({ partialSuccess: {} });
    }

    const byInstance = new Map<string, typeof records>();
    for (const r of records) {
      const instanceId = r.instanceId ?? "unknown";
      const existing = byInstance.get(instanceId) ?? [];
      existing.push(r);
      byInstance.set(instanceId, existing);
    }

    for (const [instanceId, batch] of byInstance) {
      await ingestLlmUsageBatch(
        instanceId,
        batch.map((r) => ({
          provider: r.provider,
          model: r.model,
          operation: r.operation,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          costUsd: r.costUsd,
          traceId: r.traceId,
          ts: r.ts,
        })),
      );
    }

    return c.json({ partialSuccess: {} });
  } catch (err) {
    logger.error({ err }, "Failed to process OTLP traces");
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OTLP metric extraction — gen_ai.client.token.usage histogram
// ─────────────────────────────────────────────────────────────────────────────

interface ExtractedRecord {
  instanceId?: string;
  provider: string;
  model: string;
  operation?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  traceId?: string;
  ts: number;
}

function getAttr(
  attrs: Array<{ key: string; value: { stringValue?: string; intValue?: number } }>,
  key: string,
): string | undefined {
  const attr = attrs?.find((a) => a.key === key);
  return (
    attr?.value?.stringValue ??
    (attr?.value?.intValue != null ? String(attr.value.intValue) : undefined)
  );
}

function extractGenAiMetrics(body: unknown): ExtractedRecord[] {
  const records: ExtractedRecord[] = [];

  try {
    const otlp = body as {
      resourceMetrics?: Array<{
        resource?: { attributes?: Array<{ key: string; value: { stringValue?: string } }> };
        scopeMetrics?: Array<{
          metrics?: Array<{
            name?: string;
            histogram?: {
              dataPoints?: Array<{
                attributes?: Array<{
                  key: string;
                  value: { stringValue?: string; intValue?: number };
                }>;
                sum?: number;
                timeUnixNano?: string;
              }>;
            };
          }>;
        }>;
      }>;
    };

    for (const rm of otlp.resourceMetrics ?? []) {
      const resourceAttrs = rm.resource?.attributes ?? [];
      const instanceId = getAttr(resourceAttrs, "service.instance.id");

      for (const sm of rm.scopeMetrics ?? []) {
        for (const metric of sm.metrics ?? []) {
          if (metric.name !== "gen_ai.client.token.usage") continue;

          for (const dp of metric.histogram?.dataPoints ?? []) {
            const attrs = dp.attributes ?? [];
            const provider = getAttr(attrs, "gen_ai.provider.name") ?? "unknown";
            const model = getAttr(attrs, "gen_ai.response.model") ?? "unknown";
            const tokenType = getAttr(attrs, "gen_ai.token.type");
            const operation = getAttr(attrs, "gen_ai.operation.name");

            // gen_ai.client.token.usage reports input/output as separate data points
            const tokens = dp.sum ?? 0;
            const isInput = tokenType === "input" || tokenType === "prompt";
            const ts = dp.timeUnixNano
              ? Math.floor(Number(dp.timeUnixNano) / 1_000_000)
              : Date.now();

            records.push({
              instanceId,
              provider,
              model,
              operation,
              inputTokens: isInput ? tokens : 0,
              outputTokens: isInput ? 0 : tokens,
              costUsd: computeLlmCost(provider, model, isInput ? tokens : 0, isInput ? 0 : tokens),
              ts,
            });
          }
        }
      }
    }
  } catch {
    // Malformed OTLP payload — return empty
  }

  return records;
}

// ─────────────────────────────────────────────────────────────────────────────
// OTLP trace extraction — gen_ai inference spans
// ─────────────────────────────────────────────────────────────────────────────

function extractGenAiSpans(body: unknown): ExtractedRecord[] {
  const records: ExtractedRecord[] = [];

  try {
    const otlp = body as {
      resourceSpans?: Array<{
        resource?: { attributes?: Array<{ key: string; value: { stringValue?: string } }> };
        scopeSpans?: Array<{
          spans?: Array<{
            traceId?: string;
            attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: number } }>;
            endTimeUnixNano?: string;
          }>;
        }>;
      }>;
    };

    for (const rs of otlp.resourceSpans ?? []) {
      const resourceAttrs = rs.resource?.attributes ?? [];
      const instanceId = getAttr(resourceAttrs, "service.instance.id");

      for (const ss of rs.scopeSpans ?? []) {
        for (const span of ss.spans ?? []) {
          const attrs = span.attributes ?? [];
          const provider = getAttr(attrs, "gen_ai.provider.name");
          if (!provider) continue; // Not a gen_ai span

          const model =
            getAttr(attrs, "gen_ai.response.model") ??
            getAttr(attrs, "gen_ai.request.model") ??
            "unknown";
          const operation = getAttr(attrs, "gen_ai.operation.name");
          const inputTokens = parseInt(getAttr(attrs, "gen_ai.usage.input_tokens") ?? "0", 10);
          const outputTokens = parseInt(getAttr(attrs, "gen_ai.usage.output_tokens") ?? "0", 10);
          const ts = span.endTimeUnixNano
            ? Math.floor(Number(span.endTimeUnixNano) / 1_000_000)
            : Date.now();

          records.push({
            instanceId,
            provider,
            model,
            operation,
            inputTokens,
            outputTokens,
            costUsd: computeLlmCost(provider, model, inputTokens, outputTokens),
            traceId: span.traceId,
            ts,
          });
        }
      }
    }
  } catch {
    // Malformed payload
  }

  return records;
}
