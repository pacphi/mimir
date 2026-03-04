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
