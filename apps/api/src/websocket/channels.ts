/**
 * WebSocket channel definitions for the Mimir real-time layer.
 *
 * Channel architecture (from design doc section 7):
 *   Console <──ws://──> Instance Agent
 *     ├── metrics    (instance → console, every 30s)
 *     ├── heartbeat  (instance → console, every 10s)
 *     ├── logs       (instance → console, streaming)
 *     ├── terminal   (bidirectional, per-session)
 *     ├── events     (instance → console, on occurrence)
 *     └── commands   (console → instance, on demand)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Channel names
// ─────────────────────────────────────────────────────────────────────────────

export const CHANNEL = {
  METRICS: "metrics",
  HEARTBEAT: "heartbeat",
  LOGS: "logs",
  TERMINAL: "terminal",
  EVENTS: "events",
  COMMANDS: "commands",
  LLM_USAGE: "llm_usage",
  FILESYSTEM: "filesystem",
  LSP: "lsp",
} as const;

export type Channel = (typeof CHANNEL)[keyof typeof CHANNEL];

// ─────────────────────────────────────────────────────────────────────────────
// Message type registry
// ─────────────────────────────────────────────────────────────────────────────

export const MESSAGE_TYPE = {
  // Metrics channel
  METRICS_UPDATE: "metrics:update",

  // Heartbeat channel
  HEARTBEAT_PING: "heartbeat:ping",
  HEARTBEAT_PONG: "heartbeat:pong",

  // Logs channel
  LOG_LINE: "log:line",
  LOG_BATCH: "log:batch",
  LOG_SUBSCRIBE: "log:subscribe",
  LOG_UNSUBSCRIBE: "log:unsubscribe",

  // Terminal channel
  TERMINAL_CREATE: "terminal:create",
  TERMINAL_DATA: "terminal:data",
  TERMINAL_RESIZE: "terminal:resize",
  TERMINAL_CLOSE: "terminal:close",
  TERMINAL_CREATED: "terminal:created",
  TERMINAL_ERROR: "terminal:error",

  // Events channel
  EVENT_INSTANCE: "event:instance",

  // Commands channel
  COMMAND_EXEC: "command:exec",
  COMMAND_RESULT: "command:result",

  // LLM Usage channel
  LLM_USAGE_BATCH: "llm_usage:batch",

  // Filesystem channel
  FS_LIST: "fs:list",
  FS_LISTED: "fs:listed",
  FS_READ: "fs:read",
  FS_READ_RESULT: "fs:read:result",
  FS_WRITE: "fs:write",
  FS_WRITE_ACK: "fs:write:ack",

  // LSP channel
  LSP_CONNECT: "lsp:connect",
  LSP_CONNECTED: "lsp:connected",
  LSP_DISCONNECT: "lsp:disconnect",
  LSP_JSONRPC: "lsp:jsonrpc",

  // System / connection-level
  ERROR: "error",
  ACK: "ack",
} as const;

export type MessageType = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

// ─────────────────────────────────────────────────────────────────────────────
// Envelope — every WebSocket message uses this wrapper
// ─────────────────────────────────────────────────────────────────────────────

/** Current protocol version. Bump on breaking changes to the message format. */
export const PROTOCOL_VERSION = "1.0";

export interface Envelope<T = unknown> {
  /** Protocol version for forward/backward compatibility checks */
  protocolVersion: string;
  /** Channel this message belongs to */
  channel: Channel;
  /** Message discriminator within the channel */
  type: MessageType;
  /** Instance this message concerns (set by server after auth) */
  instanceId?: string;
  /** Optional correlation ID for request/response pairing */
  correlationId?: string;
  /** Unix timestamp (ms) */
  ts: number;
  /** Payload */
  data: T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types — metrics channel
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricsPayload {
  cpuPercent: number;
  memoryUsed: number; // bytes
  memoryTotal: number; // bytes
  diskUsed: number; // bytes
  diskTotal: number; // bytes
  uptime: number; // seconds
  loadAvg: [number, number, number];
  networkBytesIn: number;
  networkBytesOut: number;
  processCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types — heartbeat channel
// ─────────────────────────────────────────────────────────────────────────────

export interface HeartbeatPayload {
  agentVersion: string;
  uptime: number; // seconds
  /** Sindri CLI version running on the instance (e.g. "3.0.1"). Phase 3. */
  sindri_version?: string;
  /** Rust target triple of the CLI binary (e.g. "x86_64-unknown-linux-musl"). Phase 3. */
  cli_target?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types — logs channel
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogLinePayload {
  level: LogLevel;
  message: string;
  source: string; // e.g. 'init', 'extension:python3', 'agent'
  ts: number;
}

export interface LogBatchPayload {
  lines: LogLinePayload[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types — terminal channel
// ─────────────────────────────────────────────────────────────────────────────

export interface TerminalCreatePayload {
  sessionId: string;
  cols: number;
  rows: number;
  shell?: string; // defaults to /bin/bash
  /** Server-generated session token for defense-in-depth validation (A5) */
  sessionToken?: string;
}

export interface TerminalDataPayload {
  sessionId: string;
  data: string; // base64-encoded PTY data
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

export interface TerminalCreatedPayload {
  sessionId: string;
  pid: number;
}

export interface TerminalErrorPayload {
  sessionId: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types — events channel
// ─────────────────────────────────────────────────────────────────────────────

export type InstanceEventType =
  | "deploy"
  | "redeploy"
  | "connect"
  | "disconnect"
  | "backup"
  | "restore"
  | "destroy"
  | "extension:install"
  | "extension:remove"
  | "heartbeat:lost"
  | "heartbeat:recovered"
  | "error";

export interface InstanceEventPayload {
  eventType: InstanceEventType;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types — commands channel
// ─────────────────────────────────────────────────────────────────────────────

export interface CommandExecPayload {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number; // ms
}

export interface CommandResultPayload {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types — LLM usage channel
// ─────────────────────────────────────────────────────────────────────────────

export interface LlmUsageRecord {
  provider: string;
  model: string;
  operation?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number;
  captureTier?: string;
  traceId?: string;
  ts: number;
}

export interface LlmUsageBatchPayload {
  records: LlmUsageRecord[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Error / ack payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface AckPayload {
  ok: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types — filesystem channel
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
  content: string; // base64-encoded file content
  encoding: "utf8" | "binary";
  error?: string;
}

export interface FsWritePayload {
  sessionId: string;
  path: string;
  content: string; // base64-encoded
  requestId: string;
}

export interface FsWriteAckPayload {
  sessionId: string;
  path: string;
  requestId: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types — LSP channel
// ─────────────────────────────────────────────────────────────────────────────

export interface LspConnectPayload {
  sessionId: string;
  languageId: string;
  rootUri: string;
}

export interface LspConnectedPayload {
  sessionId: string;
  languageId: string;
}

export interface LspDisconnectPayload {
  sessionId: string;
}

export interface LspJsonRpcPayload {
  sessionId: string;
  message: string; // raw JSON-RPC string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — build a typed envelope
// ─────────────────────────────────────────────────────────────────────────────

export function makeEnvelope<T>(
  channel: Channel,
  type: MessageType,
  data: T,
  opts?: { instanceId?: string; correlationId?: string },
): Envelope<T> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    channel,
    type,
    data,
    ts: Date.now(),
    ...opts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — parse raw JSON into an Envelope, returns null on failure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map Draupnir's flat message type to Mimir's channel + type pair.
 * Draupnir sends `{ type: "heartbeat" }`, Mimir expects
 * `{ channel: "heartbeat", type: "heartbeat:ping" }`.
 */
const DRAUPNIR_TYPE_MAP: Record<string, { channel: Channel; type: MessageType }> = {
  heartbeat: { channel: CHANNEL.HEARTBEAT, type: MESSAGE_TYPE.HEARTBEAT_PING },
  metrics: { channel: CHANNEL.METRICS, type: MESSAGE_TYPE.METRICS_UPDATE },
  "terminal:output": { channel: CHANNEL.TERMINAL, type: MESSAGE_TYPE.TERMINAL_DATA },
  "terminal:closed": { channel: CHANNEL.TERMINAL, type: MESSAGE_TYPE.TERMINAL_CLOSE },
  "command:result": { channel: CHANNEL.COMMANDS, type: MESSAGE_TYPE.COMMAND_RESULT },
  event: { channel: CHANNEL.EVENTS, type: MESSAGE_TYPE.EVENT_INSTANCE },
  registration: { channel: CHANNEL.EVENTS, type: MESSAGE_TYPE.EVENT_INSTANCE },
  "llm_usage:batch": { channel: CHANNEL.LLM_USAGE, type: MESSAGE_TYPE.LLM_USAGE_BATCH },
  "log:line": { channel: CHANNEL.LOGS, type: MESSAGE_TYPE.LOG_LINE },
  "log:batch": { channel: CHANNEL.LOGS, type: MESSAGE_TYPE.LOG_BATCH },
};

export function parseEnvelope(raw: string): Envelope | null {
  try {
    const parsed = JSON.parse(raw);

    // ── Mimir-native format ──────────────────────────────────────────────
    if (
      typeof parsed.protocolVersion === "string" &&
      typeof parsed.channel === "string" &&
      typeof parsed.type === "string" &&
      typeof parsed.ts === "number" &&
      parsed.data !== undefined
    ) {
      return parsed as Envelope;
    }

    // ── Draupnir agent format ────────────────────────────────────────────
    // Draupnir sends: { protocol_version, type, session_id?, payload }
    if (
      typeof parsed.protocol_version === "string" &&
      typeof parsed.type === "string" &&
      parsed.payload !== undefined
    ) {
      const mapping = DRAUPNIR_TYPE_MAP[parsed.type as string];
      if (!mapping) return null;

      return {
        protocolVersion: parsed.protocol_version as string,
        channel: mapping.channel,
        type: mapping.type,
        ts: Date.now(),
        data: parsed.payload,
        ...(parsed.session_id ? { correlationId: parsed.session_id as string } : {}),
      } as Envelope;
    }

    return null;
  } catch {
    return null;
  }
}
