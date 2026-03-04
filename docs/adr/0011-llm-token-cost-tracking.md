# ADR 0011: LLM Token Cost Tracking

- **Status:** Accepted
- **Date:** 2026-03-03
- **Deciders:** Core team

## Context

Sindri instances run 13+ LLM-using extensions (claude-flow, agentic-qe, ai-toolkit, claude-code-mux, etc.) that make API calls to Anthropic, OpenAI, Google Gemini, Groq, Mistral, xAI, Cohere, and local Ollama. These calls represent significant, untracked spend. The existing cost tracking system only covers infrastructure (compute, storage, network) via static pricing tables and has no visibility into AI API consumption.

### Problem

1. **Zero visibility** into per-instance LLM API costs across the fleet
2. **No standard schema** for token usage data — each provider has a different response format
3. **No aggregation** of LLM costs into the existing daily cost tracking pipeline
4. **No dashboard** for operators to identify top-spending instances or models

### Constraints

- Draupnir is a lightweight Go agent (~8 MB) — any solution must not bloat it
- Extensions call LLMs through 4 distinct patterns: CLI wrapping, HTTP proxy, direct HTTP, SDK calls
- The existing `monitoring` extension only tracks Anthropic usage — not a universal solution
- Draupnir has no plugin system — new capabilities must be compiled in
- The WebSocket protocol is extensible (new message types can be added additively)

## Decision

### 1. New Prisma model: `LlmUsageEntry`

A per-request usage record stored as a TimescaleDB hypertable:

| Column               | Type     | Description                           |
| -------------------- | -------- | ------------------------------------- |
| `id`                 | String   | CUID primary key                      |
| `instance_id`        | String   | FK to Instance                        |
| `timestamp`          | DateTime | When the LLM call occurred            |
| `provider`           | String   | OTel `gen_ai.provider.name`           |
| `model`              | String   | `gen_ai.response.model`               |
| `operation`          | String?  | `chat`, `embeddings`, `completion`    |
| `input_tokens`       | Int      | Prompt tokens                         |
| `output_tokens`      | Int      | Completion tokens                     |
| `cache_read_tokens`  | Int?     | Anthropic cache read                  |
| `cache_write_tokens` | Int?     | Anthropic cache write                 |
| `cost_usd`           | Float    | Computed cost                         |
| `source`             | String   | `agent`, `provider-api`, `reconciled` |
| `capture_tier`       | String?  | `proxy`, `ebpf`, `ollama`             |
| `trace_id`           | String?  | OTel trace correlation                |

### 2. `CostEntry` schema additions

- `llm_usd Float @default(0)` — daily LLM cost aggregated from `LlmUsageEntry`
- `source String @default("estimated")` — tracks whether the entry is estimated, actual, or reconciled

### 3. WebSocket protocol extension

New channel `llm_usage` with message type `llm_usage:batch` carrying `LlmUsageBatchPayload` (array of `LlmUsageRecord`). This is an additive, backward-compatible change — no protocol version bump required.

### 4. LLM pricing table

Embedded pricing for 45+ models across 10 providers (Anthropic, OpenAI, Google, Groq, Mistral, xAI, Cohere, Together, Bedrock, Ollama). Pricing source: [Portkey-AI/models](https://github.com/Portkey-AI/models). Lookup uses exact match → prefix match → wildcard provider match. Ollama defaults to $0.

### 5. Draupnir as universal LLM traffic interceptor

See [Draupnir ADR-004](https://github.com/pacphi/draupnir/docs/architecture/adr/004-llm-traffic-interception.md) for the agent-side architecture. Draupnir captures all LLM traffic via:

- **Tier 1 (Proxy):** Local HTTP reverse proxy on `:9090` — env var injection redirects `*_BASE_URL` to proxy
- **Tier 2 (eBPF):** SSL uprobe interception on Linux 5.8+ — catches hardcoded URLs
- **Ollama detector:** Auto-detects local inference at `localhost:11434`

### 6. Industry standards adopted

- **OpenTelemetry GenAI Semantic Conventions** (`gen_ai.*` namespace) for attribute naming
- **FOCUS 1.3** (FinOps Open Cost and Usage Specification) for billing normalization — `serviceCategory: "AI"` alongside Compute/Storage/Network

## Consequences

### Positive

- Complete visibility into AI API spend per instance, model, and provider
- LLM costs integrated into existing budget alerts and right-sizing recommendations
- Provider-agnostic — works with any LLM API that Draupnir can intercept
- Ollama tracking enables "would have cost $X on Claude" analysis
- OTel compatibility enables future Grafana/Prometheus integration

### Negative

- Pricing table requires periodic manual updates as providers change prices
- Tier 1 proxy adds ~1ms latency per LLM call (negligible vs API latency)
- Tier 2 eBPF requires Linux 5.8+ with BTF — not available on all hosts

### Files changed

**New files:**

- `apps/api/prisma/migrations/20260303200000_add_llm_usage_and_cost_enhancements/migration.sql`
- `apps/api/src/services/costs/llm-pricing.ts`
- `apps/api/src/services/costs/llm-usage.service.ts`
- `apps/api/src/routes/otel.ts`
- `apps/web/src/types/llm-cost.ts`
- `apps/web/src/api/llm-costs.ts`
- `apps/web/src/hooks/useLlmCosts.ts`
- `apps/web/src/components/costs/LlmCostDashboard.tsx`

**Modified files:**

- `apps/api/prisma/schema.prisma` — `LlmUsageEntry` model, `llm_usd`/`source` on `CostEntry`
- `packages/protocol/src/index.ts` — `LlmUsagePayload`, `NormalizedCostRecord`
- `apps/api/src/websocket/channels.ts` — `CHANNEL.LLM_USAGE`, `LlmUsageBatchPayload`
- `apps/api/src/agents/gateway.ts` — LLM_USAGE handler
- `apps/api/src/workers/cost.worker.ts` — LLM aggregation + reconciliation steps
- `apps/api/src/services/costs/cost.service.ts` — `llmUsd` in summaries/trends
- `apps/api/src/routes/costs.ts` — 4 new `/llm/*` endpoints
- `apps/api/src/app.ts` — OTEL route registration
- `apps/web/src/components/costs/CostDashboard.tsx` — LLM summary card + dashboard section

## API Endpoints

| Method | Path                              | Description                                  |
| ------ | --------------------------------- | -------------------------------------------- |
| GET    | `/api/v1/costs/llm/summary`       | LLM cost summary by provider/model/instance  |
| GET    | `/api/v1/costs/llm/trends`        | Daily LLM cost trend data                    |
| GET    | `/api/v1/costs/llm/instances/:id` | Per-instance LLM cost by model               |
| GET    | `/api/v1/costs/llm/pricing`       | Full LLM pricing table                       |
| POST   | `/api/v1/otel/v1/metrics`         | OTLP metric receiver (gen_ai.\* extraction)  |
| POST   | `/api/v1/otel/v1/traces`          | OTLP trace receiver (gen_ai span extraction) |
