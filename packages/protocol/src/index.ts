/**
 * @mimir/protocol — JSON Schema contract definitions for the mimir WebSocket protocol.
 *
 * This package is the single source of truth for the WebSocket message format
 * shared between the mimir control plane (TypeScript) and draupnir agent (Go).
 *
 * Protocol version: 1.0
 */

export const PROTOCOL_VERSION = "1.0";

export interface Envelope<T = unknown> {
  protocolVersion: string;
  channel: string;
  type: string;
  instanceId?: string;
  correlationId?: string;
  ts: number;
  data: T;
}

export interface HeartbeatPayload {
  agentVersion: string;
  uptime: number;
  sindriVersion?: string;
  cliTarget?: string;
}

export interface MetricsPayload {
  cpuPercent: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  uptime: number;
  loadAvg: [number, number, number];
  networkBytesIn: number;
  networkBytesOut: number;
  processCount: number;
}

export interface RegistrationPayload {
  instanceId: string;
  hostname: string;
  provider: string;
  region: string;
  agentVersion: string;
  os: string;
  arch: string;
  distro?: string; // "ubuntu" | "fedora" | "opensuse" — populated by Sindri agent
  tags?: Record<string, string>;
  geo?: {
    lat?: number;
    lon?: number;
    city?: string;
    source?: string; // "cloud_metadata" | "ip" | "manual"
  };
}

export interface TerminalCreatePayload {
  sessionId: string;
  cols: number;
  rows: number;
  shell?: string;
}

export interface TerminalDataPayload {
  sessionId: string;
  data: string;
}

export interface TerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalClosePayload {
  sessionId: string;
  reason?: string;
}

export interface CommandExecPayload {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export interface CommandResultPayload {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM Usage channel payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface LlmUsageRecord {
  /** OTel gen_ai.provider.name */
  provider: string;
  /** OTel gen_ai.response.model */
  model: string;
  /** OTel gen_ai.operation.name */
  operation?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Pre-computed cost in USD (agent-side pricing table) */
  costUsd: number;
  /** How the usage was captured: "proxy" | "ebpf" | "ollama" */
  captureTier?: string;
  /** OTel trace ID for correlation */
  traceId?: string;
  /** Unix timestamp (ms) of the LLM call */
  ts: number;
}

export interface LlmUsagePayload {
  /** Batch of usage records for the reporting interval */
  records: LlmUsageRecord[];
}

// ─────────────────────────────────────────────────────────────────────────────
// FOCUS 1.3 Normalized Cost Record (FinOps Open Cost and Usage Specification)
// ─────────────────────────────────────────────────────────────────────────────

export type FocusServiceCategory = "Compute" | "Storage" | "Network" | "AI" | "Other";

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
  tags?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filesystem channel payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
  modified?: string;
}

export interface FsListPayload {
  sessionId: string;
  path: string;
  requestId: string;
}

export interface FsListedPayload {
  sessionId: string;
  path: string;
  requestId: string;
  entries: FsEntry[];
  error?: string;
}

export interface FsReadPayload {
  sessionId: string;
  path: string;
  requestId: string;
}

export interface FsReadResultPayload {
  sessionId: string;
  path: string;
  requestId: string;
  content: string;
  encoding: "utf8" | "binary";
  error?: string;
}

export interface FsWritePayload {
  sessionId: string;
  path: string;
  content: string;
  requestId: string;
}

export interface FsWriteAckPayload {
  sessionId: string;
  path: string;
  requestId: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// LSP channel payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface LspConnectPayload {
  sessionId: string;
  languageId: string;
  rootUri: string;
}

export interface LspJsonRpcPayload {
  sessionId: string;
  message: string;
}
