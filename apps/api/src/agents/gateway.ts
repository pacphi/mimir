/**
 * WebSocket gateway for agent and browser client connections.
 *
 * This module attaches a `ws.WebSocketServer` to the Node.js HTTP server
 * (bypassing Hono, since Hono's node adapter wraps the native server).
 *
 * Connection types:
 *   - Instance agents (identified by X-Instance-ID header after auth)
 *   - Browser clients (authenticated the same way; no instance ID)
 *
 * Message flow:
 *   Agent → Gateway → Redis Pub/Sub → Browser clients
 *   Browser → Gateway → Redis → Agent (commands, terminal)
 *
 * Each WebSocket message is a JSON-encoded `Envelope` (see channels.ts).
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import { Prisma, type EventType } from "@prisma/client";
import pty from "node-pty";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { authenticateUpgrade } from "../websocket/auth.js";
import { parseEnvelope, makeEnvelope, CHANNEL, MESSAGE_TYPE } from "../websocket/channels.js";
import type { FsListPayload, FsReadPayload, FsWritePayload } from "../websocket/channels.js";
import { redis, redisSub, REDIS_CHANNELS, REDIS_KEYS } from "../lib/redis.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { ingestLog, ingestBatch } from "../services/logs/index.js";
import { enqueueMetric } from "../services/metrics/index.js";
import { listDirectory, readFile, writeFile } from "../services/fs-bridge.js";
import { closeTerminalSession } from "../services/terminal-sessions.js";
import type { IPty } from "node-pty";
type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
type LogSource = "AGENT" | "EXTENSION" | "BUILD" | "APP" | "SYSTEM";

// ─────────────────────────────────────────────────────────────────────────────
// Persistent PTY registry — keeps PTYs alive across WebSocket reconnections
// ─────────────────────────────────────────────────────────────────────────────

/** Grace period before a disconnected PTY is killed (5 minutes). */
const PTY_GRACE_MS = 5 * 60 * 1000;

/** Maximum number of bytes to buffer while disconnected (256 KB). */
const PTY_BUFFER_MAX = 256 * 1024;

interface PersistentPty {
  term: IPty;
  containerName: string;
  sessionId: string;
  /** Currently attached WebSocket (null when disconnected). */
  ws: WebSocket | null;
  /** Grace timer started on WS disconnect; killed on reconnect. */
  graceTimer: ReturnType<typeof setTimeout> | null;
  /** Output buffered while the browser is disconnected. */
  buffer: string;
  /** True when the PTY process has exited. */
  exited: boolean;
  exitCode: number | null;
}

const persistentPtys = new Map<string, PersistentPty>();

// ─────────────────────────────────────────────────────────────────────────────
// Agent-bridged PTY registry — proxies browser terminal to Draupnir agent PTY
// ─────────────────────────────────────────────────────────────────────────────

interface AgentBridgedPty {
  sessionId: string;
  instanceId: string;
  /** Currently attached browser WebSocket (null when disconnected). */
  ws: WebSocket | null;
  /** Grace timer started on WS disconnect; killed on reconnect. */
  graceTimer: ReturnType<typeof setTimeout> | null;
  /** Output buffered while the browser is disconnected. */
  buffer: string;
  /** True when the agent-side PTY has exited/closed. */
  exited: boolean;
  exitCode: number | null;
}

const agentBridgedPtys = new Map<string, AgentBridgedPty>();

// ─────────────────────────────────────────────────────────────────────────────
// Connection registry
// ─────────────────────────────────────────────────────────────────────────────

interface AgentConnection {
  ws: WebSocket;
  instanceId: string;
  userId: string;
  apiKeyId?: string;
  connectedAt: Date;
}

interface BrowserConnection {
  ws: WebSocket;
  userId: string;
  apiKeyId?: string;
  // Set of instance IDs this client is subscribed to
  subscriptions: Set<string>;
  // Map of instanceId → Set of log file paths this client is streaming
  logSubscriptions: Map<string, Set<string>>;
  connectedAt: Date;
}

export const agentConnections = new Map<string, AgentConnection>(); // key: instanceId
const browserConnections = new Set<BrowserConnection>();

// ─────────────────────────────────────────────────────────────────────────────
// Redis subscriber — fan-out to browser clients
// ─────────────────────────────────────────────────────────────────────────────

let redisSubInitialised = false;

function initRedisSubscriber(): void {
  if (redisSubInitialised) return;
  redisSubInitialised = true;

  // Pattern-subscribe to all sindri:instance:* channels
  redisSub.psubscribe("sindri:instance:*", (err) => {
    if (err) logger.error({ err }, "Failed to psubscribe to instance channels");
    else logger.info("Redis psubscribe: sindri:instance:*");
  });

  redisSub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    // Extract instanceId from channel: sindri:instance:<id>:<type>
    const parts = channel.split(":");
    if (parts.length < 4) return;
    const instanceId = parts[2];

    // Forward to all browser clients subscribed to this instance
    for (const client of browserConnections) {
      if (client.subscriptions.has(instanceId) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Heartbeat processing
// ─────────────────────────────────────────────────────────────────────────────

async function processHeartbeat(
  instanceId: string,
  payload: {
    cpuPercent?: number;
    memoryUsed?: number;
    memoryTotal?: number;
    diskUsed?: number;
    diskTotal?: number;
    uptime?: number;
    /** Phase 3: Sindri CLI version reported by the instance agent */
    sindri_version?: string;
    /** Phase 3: Rust target triple of the CLI binary */
    cli_target?: string;
    /** Distro reported by the agent (ubuntu, fedora, opensuse) */
    distro?: string;
    /** Extensions currently installed on the instance */
    extensions?: string[];
  },
): Promise<void> {
  try {
    // Build the instance update — always update status; only update version/distro fields when present
    const instanceUpdateData: Record<string, unknown> = { updated_at: new Date() };
    if (payload.sindri_version) instanceUpdateData.sindri_version = payload.sindri_version;
    if (payload.cli_target) instanceUpdateData.cli_target = payload.cli_target;
    if (payload.distro) instanceUpdateData.distro = payload.distro;
    if (payload.extensions && payload.extensions.length > 0) {
      instanceUpdateData.extensions = payload.extensions;
    }

    await Promise.all([
      // Persist heartbeat record
      db.heartbeat.create({
        data: {
          instance_id: instanceId,
          cpu_percent: payload.cpuPercent ?? 0,
          memory_used: BigInt(payload.memoryUsed ?? 0),
          memory_total: BigInt(payload.memoryTotal ?? 0),
          disk_used: BigInt(payload.diskUsed ?? 0),
          disk_total: BigInt(payload.diskTotal ?? 0),
          uptime: BigInt(payload.uptime ?? 0),
        },
      }),
      // Keep instance marked online in Redis (10s grace period for 10s heartbeat interval)
      redis.setex(REDIS_KEYS.instanceOnline(instanceId), 30, "1"),
      // Update instance status to RUNNING if it was previously degraded;
      // always touch updated_at and record version fields (Phase 3)
      db.instance.updateMany({
        where: { id: instanceId, status: { in: ["ERROR", "UNKNOWN"] } },
        data: { status: "RUNNING", ...instanceUpdateData },
      }),
      // For already-running instances, still persist the version/distro fields
      ...(payload.sindri_version || payload.cli_target || payload.distro
        ? [
            db.instance.updateMany({
              where: { id: instanceId, status: { notIn: ["ERROR", "UNKNOWN"] } },
              data: instanceUpdateData,
            }),
          ]
        : []),
    ]);
  } catch (err) {
    logger.warn({ err, instanceId }, "Failed to persist heartbeat");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message routing
// ─────────────────────────────────────────────────────────────────────────────

async function routeAgentMessage(conn: AgentConnection, raw: string): Promise<void> {
  const envelope = parseEnvelope(raw);
  if (!envelope) {
    logger.warn(
      { instanceId: conn.instanceId, rawPreview: raw.slice(0, 200) },
      "Received invalid envelope from agent",
    );
    return;
  }

  const { channel, type, data } = envelope;
  logger.debug({ instanceId: conn.instanceId, channel, type }, "Routing agent message");

  switch (channel) {
    case CHANNEL.HEARTBEAT:
      if (type === MESSAGE_TYPE.HEARTBEAT_PING) {
        // Normalize Draupnir's heartbeat payload (uptime_seconds → uptime)
        const hbData = data as Record<string, unknown>;
        const normalizedHb: Record<string, unknown> = {};
        if (hbData.uptime_seconds != null) normalizedHb.uptime = Number(hbData.uptime_seconds);
        if (hbData.uptime != null) normalizedHb.uptime = Number(hbData.uptime);
        // Pass through any Mimir-native fields
        for (const key of ["cpuPercent", "memoryUsed", "memoryTotal", "diskUsed", "diskTotal"]) {
          if (hbData[key] != null) normalizedHb[key] = Number(hbData[key]);
        }
        // Pass through string metadata fields
        if (typeof hbData.sindri_version === "string")
          normalizedHb.sindri_version = hbData.sindri_version;
        if (typeof hbData.cli_target === "string") normalizedHb.cli_target = hbData.cli_target;
        if (typeof hbData.distro === "string") normalizedHb.distro = hbData.distro;
        if (Array.isArray(hbData.extensions)) normalizedHb.extensions = hbData.extensions;
        await processHeartbeat(
          conn.instanceId,
          normalizedHb as Parameters<typeof processHeartbeat>[1],
        );
        // Publish to Redis for browser fan-out
        const hbChannel = REDIS_CHANNELS.instanceHeartbeat(conn.instanceId);
        await redis.publish(
          hbChannel,
          JSON.stringify(
            makeEnvelope(CHANNEL.HEARTBEAT, MESSAGE_TYPE.HEARTBEAT_PONG, data, {
              instanceId: conn.instanceId,
            }),
          ),
        );
        // Ack back to agent
        conn.ws.send(
          JSON.stringify(
            makeEnvelope(
              CHANNEL.HEARTBEAT,
              MESSAGE_TYPE.HEARTBEAT_PONG,
              { ok: true },
              {
                instanceId: conn.instanceId,
              },
            ),
          ),
        );
      }
      break;

    case CHANNEL.METRICS: {
      // Persist metric to write buffer (flushed every 60s by aggregation worker)
      // Normalize Draupnir's nested metrics format to Mimir's flat format
      const rawMetrics = data as Record<string, unknown>;
      const cpu = (rawMetrics.cpu ?? {}) as Record<string, unknown>;
      const mem = (rawMetrics.memory ?? {}) as Record<string, unknown>;
      const disk = rawMetrics.disk as Array<Record<string, unknown>> | undefined;
      const net = (rawMetrics.network ?? {}) as Record<string, unknown>;

      // Aggregate disk metrics across all mount points
      let diskUsedTotal = 0;
      let diskTotalTotal = 0;
      if (Array.isArray(disk)) {
        for (const d of disk) {
          diskUsedTotal += Number(d.used_bytes ?? 0);
          diskTotalTotal += Number(d.total_bytes ?? 0);
        }
      }

      const metricsData = {
        // Mimir-native flat fields (pass through if present)
        cpuPercent: rawMetrics.cpuPercent as number | undefined,
        loadAvg1: rawMetrics.loadAvg1 as number | undefined,
        loadAvg5: rawMetrics.loadAvg5 as number | undefined,
        loadAvg15: rawMetrics.loadAvg15 as number | undefined,
        cpuSteal: rawMetrics.cpuSteal as number | undefined,
        coreCount: rawMetrics.coreCount as number | undefined,
        memUsed: rawMetrics.memUsed as number | undefined,
        memTotal: rawMetrics.memTotal as number | undefined,
        memCached: rawMetrics.memCached as number | undefined,
        swapUsed: rawMetrics.swapUsed as number | undefined,
        swapTotal: rawMetrics.swapTotal as number | undefined,
        diskUsed: rawMetrics.diskUsed as number | undefined,
        diskTotal: rawMetrics.diskTotal as number | undefined,
        diskReadBps: rawMetrics.diskReadBps as number | undefined,
        diskWriteBps: rawMetrics.diskWriteBps as number | undefined,
        netBytesSent: rawMetrics.netBytesSent as number | undefined,
        netBytesRecv: rawMetrics.netBytesRecv as number | undefined,
        netPacketsSent: rawMetrics.netPacketsSent as number | undefined,
        netPacketsRecv: rawMetrics.netPacketsRecv as number | undefined,
        ts: rawMetrics.ts as number | undefined,
      };

      // Overlay Draupnir nested fields when Mimir-native fields are absent
      if (metricsData.cpuPercent == null && cpu.usage_percent != null)
        metricsData.cpuPercent = Number(cpu.usage_percent);
      if (metricsData.loadAvg1 == null && cpu.load_avg_1 != null)
        metricsData.loadAvg1 = Number(cpu.load_avg_1);
      if (metricsData.loadAvg5 == null && cpu.load_avg_5 != null)
        metricsData.loadAvg5 = Number(cpu.load_avg_5);
      if (metricsData.loadAvg15 == null && cpu.load_avg_15 != null)
        metricsData.loadAvg15 = Number(cpu.load_avg_15);
      if (metricsData.coreCount == null && cpu.core_count != null)
        metricsData.coreCount = Number(cpu.core_count);
      if (metricsData.memUsed == null && mem.used_bytes != null)
        metricsData.memUsed = Number(mem.used_bytes);
      if (metricsData.memTotal == null && mem.total_bytes != null)
        metricsData.memTotal = Number(mem.total_bytes);
      if (metricsData.memCached == null && mem.cached_bytes != null)
        metricsData.memCached = Number(mem.cached_bytes);
      if (metricsData.swapUsed == null && mem.swap_used_bytes != null)
        metricsData.swapUsed = Number(mem.swap_used_bytes);
      if (metricsData.swapTotal == null && mem.swap_total_bytes != null)
        metricsData.swapTotal = Number(mem.swap_total_bytes);
      if (metricsData.diskUsed == null && diskUsedTotal > 0) metricsData.diskUsed = diskUsedTotal;
      if (metricsData.diskTotal == null && diskTotalTotal > 0)
        metricsData.diskTotal = diskTotalTotal;
      if (metricsData.netBytesSent == null && net.bytes_sent != null)
        metricsData.netBytesSent = Number(net.bytes_sent);
      if (metricsData.netBytesRecv == null && net.bytes_recv != null)
        metricsData.netBytesRecv = Number(net.bytes_recv);
      if (metricsData.netPacketsSent == null && net.packets_sent != null)
        metricsData.netPacketsSent = Number(net.packets_sent);
      if (metricsData.netPacketsRecv == null && net.packets_recv != null)
        metricsData.netPacketsRecv = Number(net.packets_recv);
      // Use Draupnir's timestamp if present
      if (metricsData.ts == null && rawMetrics.timestamp != null)
        metricsData.ts = new Date(rawMetrics.timestamp as string).getTime();

      enqueueMetric({
        instanceId: conn.instanceId,
        timestamp: metricsData.ts ? new Date(metricsData.ts) : new Date(),
        cpuPercent: metricsData.cpuPercent ?? 0,
        loadAvg1: metricsData.loadAvg1,
        loadAvg5: metricsData.loadAvg5,
        loadAvg15: metricsData.loadAvg15,
        cpuSteal: metricsData.cpuSteal,
        coreCount: metricsData.coreCount,
        memUsed: BigInt(metricsData.memUsed ?? 0),
        memTotal: BigInt(metricsData.memTotal ?? 0),
        memCached: metricsData.memCached != null ? BigInt(metricsData.memCached) : undefined,
        swapUsed: metricsData.swapUsed != null ? BigInt(metricsData.swapUsed) : undefined,
        swapTotal: metricsData.swapTotal != null ? BigInt(metricsData.swapTotal) : undefined,
        diskUsed: BigInt(metricsData.diskUsed ?? 0),
        diskTotal: BigInt(metricsData.diskTotal ?? 0),
        diskReadBps: metricsData.diskReadBps != null ? BigInt(metricsData.diskReadBps) : undefined,
        diskWriteBps:
          metricsData.diskWriteBps != null ? BigInt(metricsData.diskWriteBps) : undefined,
        netBytesSent:
          metricsData.netBytesSent != null ? BigInt(metricsData.netBytesSent) : undefined,
        netBytesRecv:
          metricsData.netBytesRecv != null ? BigInt(metricsData.netBytesRecv) : undefined,
        netPacketsSent:
          metricsData.netPacketsSent != null ? BigInt(metricsData.netPacketsSent) : undefined,
        netPacketsRecv:
          metricsData.netPacketsRecv != null ? BigInt(metricsData.netPacketsRecv) : undefined,
      });

      // Publish a flat metrics:snapshot message for browser consumption
      // (matches the MetricsStreamMessage interface the frontend expects)
      const snapshot = {
        type: "metrics:snapshot",
        instance_id: conn.instanceId,
        ts: metricsData.ts ?? Date.now(),
        cpu_percent: metricsData.cpuPercent ?? 0,
        memory_used: metricsData.memUsed ?? 0,
        memory_total: metricsData.memTotal ?? 0,
        disk_used: metricsData.diskUsed ?? 0,
        disk_total: metricsData.diskTotal ?? 0,
        network_bytes_in: metricsData.netBytesRecv ?? 0,
        network_bytes_out: metricsData.netBytesSent ?? 0,
      };
      await redis
        .publish(REDIS_CHANNELS.instanceMetrics(conn.instanceId), JSON.stringify(snapshot))
        .catch((err: unknown) => logger.warn({ err }, "Failed to publish metrics"));
      break;
    }

    case CHANNEL.LOGS: {
      // Persist log(s) to database, then fan-out via Redis (ingestLog publishes internally)
      const logLevelMap: Record<string, LogLevel> = {
        debug: "DEBUG",
        info: "INFO",
        warn: "WARN",
        warning: "WARN",
        error: "ERROR",
        err: "ERROR",
      };
      const logSourceMap: Record<string, LogSource> = {
        agent: "AGENT",
        extension: "EXTENSION",
        build: "BUILD",
        app: "APP",
        system: "SYSTEM",
      };

      if (type === MESSAGE_TYPE.LOG_BATCH) {
        // Batch ingestion
        const batchData = data as {
          path?: string;
          lines?: Array<{
            line?: string;
            level?: string;
            source?: string;
            message?: string;
            ts?: number;
            timestamp?: number;
            metadata?: Record<string, unknown>;
            deploymentId?: string;
          }>;
        };
        const lines = batchData.lines ?? [];
        ingestBatch({
          entries: lines.map((l) => ({
            instanceId: conn.instanceId,
            level: (logLevelMap[String(l.level ?? "info").toLowerCase()] ?? "INFO") as LogLevel,
            source: (logSourceMap[
              String(l.source ?? "agent")
                .toLowerCase()
                .split(":")[0]
            ] ?? "SYSTEM") as LogSource,
            message: String(l.message ?? l.line ?? ""),
            metadata: l.metadata,
            deploymentId: l.deploymentId,
            timestamp: l.ts ? new Date(l.ts) : l.timestamp ? new Date(l.timestamp) : new Date(),
          })),
        }).catch((err: unknown) =>
          logger.warn({ err, instanceId: conn.instanceId }, "Failed to ingest log batch"),
        );

        // Publish to Redis for SSE subscribers
        await redis
          .publish(
            REDIS_CHANNELS.instanceLogs(conn.instanceId),
            JSON.stringify({ ...envelope, instanceId: conn.instanceId }),
          )
          .catch((err: unknown) => logger.warn({ err }, "Failed to publish log batch to Redis"));

        // Fan out to subscribed browser WebSocket clients
        for (const client of browserConnections) {
          if (
            client.subscriptions.has(conn.instanceId) &&
            client.ws.readyState === WebSocket.OPEN
          ) {
            client.ws.send(JSON.stringify({ ...envelope, instanceId: conn.instanceId }));
          }
        }
      } else {
        // Single log line (log:line or legacy format)
        const lineData = data as {
          path?: string;
          line?: string;
          level?: string;
          source?: string;
          message?: string;
          ts?: number;
          timestamp?: number;
          metadata?: Record<string, unknown>;
          deploymentId?: string;
        };
        const resolvedLevel = logLevelMap[String(lineData.level ?? "info").toLowerCase()] ?? "INFO";
        ingestLog({
          instanceId: conn.instanceId,
          level: resolvedLevel as LogLevel,
          source: (logSourceMap[
            String(lineData.source ?? "agent")
              .toLowerCase()
              .split(":")[0]
          ] ?? "SYSTEM") as LogSource,
          message: String(lineData.message ?? lineData.line ?? ""),
          metadata: lineData.metadata,
          deploymentId: lineData.deploymentId,
          timestamp: lineData.ts
            ? new Date(lineData.ts)
            : lineData.timestamp
              ? new Date(lineData.timestamp)
              : new Date(),
        }).catch((err: unknown) =>
          logger.warn({ err, instanceId: conn.instanceId }, "Failed to ingest log line"),
        );

        // Publish to Redis for SSE subscribers
        await redis
          .publish(
            REDIS_CHANNELS.instanceLogs(conn.instanceId),
            JSON.stringify({ ...envelope, instanceId: conn.instanceId }),
          )
          .catch((err: unknown) => logger.warn({ err }, "Failed to publish log line to Redis"));

        // Fan out to subscribed browser WebSocket clients
        for (const client of browserConnections) {
          if (
            client.subscriptions.has(conn.instanceId) &&
            client.ws.readyState === WebSocket.OPEN
          ) {
            client.ws.send(JSON.stringify({ ...envelope, instanceId: conn.instanceId }));
          }
        }
      }
      break;
    }

    case CHANNEL.EVENTS: {
      await redis
        .publish(
          REDIS_CHANNELS.instanceEvents(conn.instanceId),
          JSON.stringify({ ...envelope, instanceId: conn.instanceId }),
        )
        .catch((err: unknown) => logger.warn({ err }, "Failed to publish event"));

      // Map the event type from the payload to a valid EventType enum value
      const eventData = data as { eventType?: string; type?: string; [k: string]: unknown } | null;
      const rawEventType = (eventData?.eventType ?? eventData?.type ?? type ?? "").toUpperCase();

      const EVENT_TYPE_MAP: Record<string, EventType> = {
        DEPLOY: "DEPLOY",
        REDEPLOY: "REDEPLOY",
        CONNECT: "CONNECT",
        DISCONNECT: "DISCONNECT",
        BACKUP: "BACKUP",
        RESTORE: "RESTORE",
        DESTROY: "DESTROY",
        SUSPEND: "SUSPEND",
        RESUME: "RESUME",
        EXTENSION_INSTALL: "EXTENSION_INSTALL",
        EXTENSION_REMOVE: "EXTENSION_REMOVE",
        HEARTBEAT_LOST: "HEARTBEAT_LOST",
        HEARTBEAT_RECOVERED: "HEARTBEAT_RECOVERED",
        ERROR: "ERROR",
      };
      const mappedEventType: EventType = EVENT_TYPE_MAP[rawEventType] ?? "DEPLOY";

      db.event
        .create({
          data: {
            instance_id: conn.instanceId,
            event_type: mappedEventType,
            metadata: (data ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        })
        .catch((err: unknown) => logger.warn({ err }, "Failed to persist event"));
      break;
    }

    case CHANNEL.TERMINAL: {
      // Route to agent-bridged terminal session if one exists for this sessionId
      const termSessionId = envelope.correlationId;
      const bridgedEntry = termSessionId ? agentBridgedPtys.get(termSessionId) : null;

      if (bridgedEntry) {
        if (type === MESSAGE_TYPE.TERMINAL_DATA) {
          const termData = data as { session_id?: string; data?: string };
          // Draupnir sends base64-encoded PTY output — decode to UTF-8 for the browser
          const decoded = termData.data
            ? Buffer.from(termData.data, "base64").toString("utf-8")
            : "";

          if (bridgedEntry.ws?.readyState === WebSocket.OPEN) {
            bridgedEntry.ws.send(JSON.stringify({ type: "data", data: decoded }));
          } else {
            // Buffer output while browser is away (up to max)
            if (bridgedEntry.buffer.length < PTY_BUFFER_MAX) {
              bridgedEntry.buffer += decoded;
              if (bridgedEntry.buffer.length > PTY_BUFFER_MAX) {
                bridgedEntry.buffer = bridgedEntry.buffer.slice(-PTY_BUFFER_MAX);
              }
            }
          }
        } else if (type === MESSAGE_TYPE.TERMINAL_CLOSE) {
          const closeData = data as { exit_code?: number };
          bridgedEntry.exited = true;
          bridgedEntry.exitCode = closeData.exit_code ?? null;

          if (bridgedEntry.ws?.readyState === WebSocket.OPEN) {
            bridgedEntry.ws.send(
              JSON.stringify({
                type: "data",
                data: `\r\n[Process exited${closeData.exit_code != null ? ` with code ${closeData.exit_code}` : ""}]\r\n`,
              }),
            );
            bridgedEntry.ws.close(1000, "Process exited");
          }

          if (bridgedEntry.graceTimer) {
            clearTimeout(bridgedEntry.graceTimer);
            bridgedEntry.graceTimer = null;
          }
          agentBridgedPtys.delete(termSessionId!);
          closeTerminalSession(termSessionId!, "process_exit").catch((err) =>
            logger.warn(
              { err, sessionId: termSessionId },
              "Failed to close bridged terminal session",
            ),
          );
        }
      }

      // Also fan out to main WS browser subscribers (for any other consumers)
      for (const client of browserConnections) {
        if (client.subscriptions.has(conn.instanceId) && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ ...envelope, instanceId: conn.instanceId }));
        }
      }
      break;
    }

    case CHANNEL.COMMANDS: {
      // Store command result in Redis so the HTTP route can pick it up.
      // Draupnir sets command_id inside the payload (not session_id on the envelope),
      // so we fall back to extracting it from the data.
      const cmdPayload = data as Record<string, unknown>;
      const corrId = envelope.correlationId || (cmdPayload.command_id as string | undefined);
      if (type === MESSAGE_TYPE.COMMAND_RESULT && corrId) {
        const resultKey = `sindri:cmd:result:${corrId}`;
        await redis
          .setex(resultKey, 120, JSON.stringify(data))
          .catch((err: unknown) => logger.warn({ err }, "Failed to store command result"));
        // Also fan-out to subscribed browser clients
        for (const client of browserConnections) {
          if (
            client.subscriptions.has(conn.instanceId) &&
            client.ws.readyState === WebSocket.OPEN
          ) {
            client.ws.send(JSON.stringify({ ...envelope, instanceId: conn.instanceId }));
          }
        }
      }
      break;
    }

    case CHANNEL.LLM_USAGE: {
      // Ingest LLM usage batch from agent
      const llmData = data as { records?: unknown[] };
      if (llmData.records && llmData.records.length > 0) {
        // Lazy import to avoid circular deps
        const { ingestLlmUsageBatch } = await import("../services/costs/llm-usage.service.js");
        ingestLlmUsageBatch(
          conn.instanceId,
          llmData.records as Parameters<typeof ingestLlmUsageBatch>[1],
        ).catch((err: unknown) =>
          logger.warn({ err, instanceId: conn.instanceId }, "Failed to ingest LLM usage batch"),
        );
        // Publish to Redis for real-time dashboard updates
        await redis
          .publish(
            REDIS_CHANNELS.instanceEvents(conn.instanceId),
            JSON.stringify({ ...envelope, instanceId: conn.instanceId }),
          )
          .catch((err: unknown) => logger.warn({ err }, "Failed to publish LLM usage event"));
      }
      break;
    }

    default:
      logger.warn({ channel, type, instanceId: conn.instanceId }, "Unknown channel from agent");
  }
}

async function routeBrowserMessage(conn: BrowserConnection, raw: string): Promise<void> {
  const envelope = parseEnvelope(raw);
  if (!envelope) return;

  const { channel, type, instanceId } = envelope;

  if (!instanceId) {
    // Subscribe/unsubscribe messages (raw string comparison — browser sends
    // system-level messages outside the typed Channel/MessageType enums)
    const ch = channel as string;
    const mt = type as string;
    if (
      ch === "system" &&
      mt === "subscribe" &&
      typeof (envelope.data as { instanceId?: string }).instanceId === "string"
    ) {
      conn.subscriptions.add((envelope.data as { instanceId: string }).instanceId);
    } else if (
      ch === "system" &&
      mt === "unsubscribe" &&
      typeof (envelope.data as { instanceId?: string }).instanceId === "string"
    ) {
      conn.subscriptions.delete((envelope.data as { instanceId: string }).instanceId);
    }
    return;
  }

  // Handle log subscription messages from browser
  if (channel === CHANNEL.LOGS) {
    if (type === MESSAGE_TYPE.LOG_SUBSCRIBE) {
      const subData = envelope.data as { instanceId?: string; paths?: string[] };
      const targetId = subData.instanceId ?? instanceId;
      if (targetId && Array.isArray(subData.paths)) {
        // Track log subscriptions on this browser connection
        if (!conn.logSubscriptions.has(targetId)) {
          conn.logSubscriptions.set(targetId, new Set());
        }
        const pathSet = conn.logSubscriptions.get(targetId)!;
        for (const p of subData.paths) {
          pathSet.add(p);
        }
        // Also ensure the browser is subscribed to the instance for fan-out
        conn.subscriptions.add(targetId);
        // Forward to the Draupnir agent so it starts tailing (use Draupnir envelope format)
        const agentConn = agentConnections.get(targetId);
        if (agentConn && agentConn.ws.readyState === WebSocket.OPEN) {
          agentConn.ws.send(
            JSON.stringify({
              protocol_version: "1.0",
              type: "log:subscribe",
              payload: { paths: subData.paths },
            }),
          );
        }
        logger.debug(
          { userId: conn.userId, instanceId: targetId, paths: subData.paths },
          "Browser subscribed to log streams",
        );
      }
      return;
    }

    if (type === MESSAGE_TYPE.LOG_UNSUBSCRIBE) {
      const unsubData = envelope.data as { instanceId?: string; paths?: string[] };
      const targetId = unsubData.instanceId ?? instanceId;
      if (targetId) {
        if (unsubData.paths && unsubData.paths.length > 0) {
          const pathSet = conn.logSubscriptions.get(targetId);
          if (pathSet) {
            for (const p of unsubData.paths) {
              pathSet.delete(p);
            }
            if (pathSet.size === 0) conn.logSubscriptions.delete(targetId);
          }
        } else {
          // Unsubscribe from all paths for this instance
          conn.logSubscriptions.delete(targetId);
        }
        // Forward to the Draupnir agent so it stops tailing (use Draupnir envelope format)
        const agentConn = agentConnections.get(targetId);
        if (agentConn && agentConn.ws.readyState === WebSocket.OPEN) {
          agentConn.ws.send(
            JSON.stringify({
              protocol_version: "1.0",
              type: "log:unsubscribe",
              payload: { paths: unsubData.paths ?? [] },
            }),
          );
        }
        logger.debug(
          { userId: conn.userId, instanceId: targetId, paths: unsubData.paths },
          "Browser unsubscribed from log streams",
        );
      }
      return;
    }
  }

  // Handle filesystem operations from browser (Shell IDE)
  if (channel === CHANNEL.FILESYSTEM) {
    // Look up the instance to get the container name
    const instance = await db.instance.findUnique({
      where: { id: instanceId },
      select: { name: true, provider: true },
    });

    if (!instance) {
      conn.ws.send(
        JSON.stringify(
          makeEnvelope(
            CHANNEL.FILESYSTEM,
            MESSAGE_TYPE.FS_LISTED,
            {
              error: "Instance not found",
              requestId: (envelope.data as { requestId?: string })?.requestId,
            },
            { instanceId },
          ),
        ),
      );
      return;
    }

    if (instance.provider !== "docker") {
      conn.ws.send(
        JSON.stringify(
          makeEnvelope(
            CHANNEL.FILESYSTEM,
            MESSAGE_TYPE.FS_LISTED,
            {
              error: `Filesystem operations not yet supported for ${instance.provider} instances`,
              requestId: (envelope.data as { requestId?: string })?.requestId,
            },
            { instanceId },
          ),
        ),
      );
      return;
    }

    switch (type) {
      case MESSAGE_TYPE.FS_LIST: {
        const payload = envelope.data as FsListPayload;
        try {
          const entries = await listDirectory(instance.name, payload.path);
          conn.ws.send(
            JSON.stringify(
              makeEnvelope(
                CHANNEL.FILESYSTEM,
                MESSAGE_TYPE.FS_LISTED,
                {
                  sessionId: payload.sessionId,
                  path: payload.path,
                  requestId: payload.requestId,
                  entries,
                },
                { instanceId },
              ),
            ),
          );
        } catch (err) {
          logger.warn({ err, instanceId, path: payload.path }, "fs:list failed");
          conn.ws.send(
            JSON.stringify(
              makeEnvelope(
                CHANNEL.FILESYSTEM,
                MESSAGE_TYPE.FS_LISTED,
                {
                  sessionId: payload.sessionId,
                  path: payload.path,
                  requestId: payload.requestId,
                  entries: [],
                  error: err instanceof Error ? err.message : "Failed to list directory",
                },
                { instanceId },
              ),
            ),
          );
        }
        break;
      }

      case MESSAGE_TYPE.FS_READ: {
        const payload = envelope.data as FsReadPayload;
        try {
          const result = await readFile(instance.name, payload.path);
          conn.ws.send(
            JSON.stringify(
              makeEnvelope(
                CHANNEL.FILESYSTEM,
                MESSAGE_TYPE.FS_READ_RESULT,
                {
                  sessionId: payload.sessionId,
                  path: payload.path,
                  requestId: payload.requestId,
                  content: result.content,
                  encoding: result.encoding,
                },
                { instanceId },
              ),
            ),
          );
        } catch (err) {
          logger.warn({ err, instanceId, path: payload.path }, "fs:read failed");
          conn.ws.send(
            JSON.stringify(
              makeEnvelope(
                CHANNEL.FILESYSTEM,
                MESSAGE_TYPE.FS_READ_RESULT,
                {
                  sessionId: payload.sessionId,
                  path: payload.path,
                  requestId: payload.requestId,
                  content: "",
                  encoding: "utf8" as const,
                  error: err instanceof Error ? err.message : "Failed to read file",
                },
                { instanceId },
              ),
            ),
          );
        }
        break;
      }

      case MESSAGE_TYPE.FS_WRITE: {
        const payload = envelope.data as FsWritePayload;
        try {
          await writeFile(instance.name, payload.path, payload.content);
          conn.ws.send(
            JSON.stringify(
              makeEnvelope(
                CHANNEL.FILESYSTEM,
                MESSAGE_TYPE.FS_WRITE_ACK,
                {
                  sessionId: payload.sessionId,
                  path: payload.path,
                  requestId: payload.requestId,
                },
                { instanceId },
              ),
            ),
          );
        } catch (err) {
          logger.warn({ err, instanceId, path: payload.path }, "fs:write failed");
          conn.ws.send(
            JSON.stringify(
              makeEnvelope(
                CHANNEL.FILESYSTEM,
                MESSAGE_TYPE.FS_WRITE_ACK,
                {
                  sessionId: payload.sessionId,
                  path: payload.path,
                  requestId: payload.requestId,
                  error: err instanceof Error ? err.message : "Failed to write file",
                },
                { instanceId },
              ),
            ),
          );
        }
        break;
      }

      default:
        logger.warn({ type, instanceId }, "Unknown filesystem message type");
    }
    return;
  }

  // Route to agent via Redis commands channel
  if (channel === CHANNEL.COMMANDS || channel === CHANNEL.TERMINAL) {
    await redis
      .publish(REDIS_CHANNELS.instanceCommands(instanceId), JSON.stringify(envelope))
      .catch((err: unknown) => logger.warn({ err }, "Failed to publish command to agent"));

    // Also forward directly if agent is connected on this server
    const agentConn = agentConnections.get(instanceId);
    if (agentConn && agentConn.ws.readyState === WebSocket.OPEN) {
      agentConn.ws.send(raw);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway setup
// ─────────────────────────────────────────────────────────────────────────────

export function attachWebSocketGateway(server: Server): WebSocketServer {
  initRedisSubscriber();

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    // Authenticate
    let principal: Awaited<ReturnType<typeof authenticateUpgrade>>;
    try {
      principal = await authenticateUpgrade(req);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unauthorized";
      ws.close(1008, message);
      logger.warn({ message }, "WebSocket auth rejected");
      return;
    }

    const isAgent = Boolean(principal.instanceId);

    if (isAgent && principal.instanceId) {
      const conn: AgentConnection = {
        ws,
        instanceId: principal.instanceId,
        userId: principal.userId,
        apiKeyId: principal.apiKeyId,
        connectedAt: new Date(),
      };

      // Replace any existing connection from this instance
      const existing = agentConnections.get(principal.instanceId);
      if (existing) existing.ws.close(1001, "Replaced by new connection");
      agentConnections.set(principal.instanceId, conn);

      // Mark online in Redis
      await redis.sadd(REDIS_KEYS.activeAgents, principal.instanceId).catch(() => {});
      await redis.setex(REDIS_KEYS.instanceOnline(principal.instanceId), 30, "1").catch(() => {});

      // Update instance status
      await db.instance
        .updateMany({
          where: { id: principal.instanceId, status: "STOPPED" },
          data: { status: "RUNNING", updated_at: new Date() },
        })
        .catch(() => {});

      logger.info({ instanceId: principal.instanceId }, "Agent connected via WebSocket");

      // Auto-subscribe to all log files so they flow into the DB for the DB Logs view.
      // The wildcard "*" tells the agent to discover and tail all .log files.
      ws.send(
        JSON.stringify({
          protocol_version: "1.0",
          type: "log:subscribe",
          payload: { paths: ["*"] },
        }),
      );

      ws.on("message", async (data) => {
        await routeAgentMessage(conn, data.toString());
      });

      ws.on("close", async (code, reason) => {
        agentConnections.delete(principal.instanceId!);
        await redis.srem(REDIS_KEYS.activeAgents, principal.instanceId!).catch(() => {});

        // Terminate all agent-bridged terminal sessions for this instance
        for (const [sid, entry] of agentBridgedPtys) {
          if (entry.instanceId !== principal.instanceId) continue;

          if (entry.ws?.readyState === WebSocket.OPEN) {
            entry.ws.send(
              JSON.stringify({
                type: "data",
                data: "\r\n[Agent disconnected]\r\n",
              }),
            );
            entry.ws.close(1001, "Agent disconnected");
          }

          if (entry.graceTimer) {
            clearTimeout(entry.graceTimer);
            entry.graceTimer = null;
          }
          agentBridgedPtys.delete(sid);
          closeTerminalSession(sid, "agent_disconnected").catch((err) =>
            logger.warn(
              { err, sessionId: sid },
              "Failed to close bridged session on agent disconnect",
            ),
          );
        }

        // Mark instance as degraded after agent disconnects
        await db.instance
          .updateMany({
            where: { id: principal.instanceId!, status: "RUNNING" },
            data: { status: "ERROR", updated_at: new Date() },
          })
          .catch(() => {});

        logger.info(
          { instanceId: principal.instanceId, code, reason: reason.toString() },
          "Agent disconnected",
        );
      });
    } else {
      // Browser client connection
      const conn: BrowserConnection = {
        ws,
        userId: principal.userId,
        apiKeyId: principal.apiKeyId,
        subscriptions: new Set(),
        logSubscriptions: new Map(),
        connectedAt: new Date(),
      };
      browserConnections.add(conn);

      logger.info({ userId: principal.userId }, "Browser client connected via WebSocket");

      ws.on("message", async (data) => {
        await routeBrowserMessage(conn, data.toString());
      });

      ws.on("close", () => {
        // Clean up log subscriptions — notify agents to stop tailing (use Draupnir envelope format)
        for (const [instId, paths] of conn.logSubscriptions) {
          const agentConn = agentConnections.get(instId);
          if (agentConn && agentConn.ws.readyState === WebSocket.OPEN) {
            agentConn.ws.send(
              JSON.stringify({
                protocol_version: "1.0",
                type: "log:unsubscribe",
                payload: { paths: Array.from(paths) },
              }),
            );
          }
        }
        conn.logSubscriptions.clear();
        browserConnections.delete(conn);
        logger.info({ userId: principal.userId }, "Browser client disconnected");
      });
    }

    ws.on("error", (err) => {
      logger.warn({ err }, "WebSocket error");
    });
  });

  wss.on("error", (err) => {
    logger.error({ err }, "WebSocket server error");
  });

  logger.info("WebSocket gateway attached at /ws");

  // ── Metrics stream WebSocket: /ws/metrics/stream ────────────────────────────
  // Browser clients connect here to receive real-time metric updates from agents.
  // After connecting, the client sends JSON: { "subscribe": ["<instanceId>", ...] }

  const metricsWss = new WebSocketServer({ noServer: true });

  metricsWss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Authenticate (best-effort; unauthenticated connections are dropped)
    void authenticateUpgrade(req)
      .then((principal) => {
        logger.info({ userId: principal.userId }, "Metrics stream WebSocket connected");

        const subscribedInstances = new Set<string>();
        const metricsChannel = (id: string) => REDIS_CHANNELS.instanceMetrics(id);

        // Handle Redis pub/sub messages and forward to this client
        const handleRedisMessage = (channel: string, message: string) => {
          // channel format: sindri:instance:<id>:metrics
          const parts = channel.split(":");
          if (parts.length < 4) return;
          const instanceId = parts[2];
          if (subscribedInstances.has(instanceId) && ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        };

        redisSub.on("message", handleRedisMessage);

        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(raw.toString()) as {
              subscribe?: string[];
              unsubscribe?: string[];
            };

            // Subscribe to requested instances
            for (const id of msg.subscribe ?? []) {
              if (!subscribedInstances.has(id)) {
                subscribedInstances.add(id);
                redisSub.subscribe(metricsChannel(id), (err) => {
                  if (err) logger.warn({ err, instanceId: id }, "Metrics stream subscribe error");
                });
              }
            }

            // Unsubscribe from requested instances
            for (const id of msg.unsubscribe ?? []) {
              subscribedInstances.delete(id);
              redisSub.unsubscribe(metricsChannel(id));
            }
          } catch {
            // Ignore malformed messages
          }
        });

        ws.on("close", () => {
          redisSub.removeListener("message", handleRedisMessage);
          for (const id of subscribedInstances) {
            redisSub.unsubscribe(metricsChannel(id));
          }
          subscribedInstances.clear();
          logger.info({ userId: principal.userId }, "Metrics stream WebSocket disconnected");
        });

        ws.on("error", (err) => {
          logger.warn({ err }, "Metrics stream WebSocket error");
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Unauthorized";
        ws.close(1008, message);
        logger.warn({ message }, "Metrics stream WebSocket auth rejected");
      });
  });

  // ── Deployment progress WebSocket: /ws/deployments/:id ─────────────────────

  const deploymentWss = new WebSocketServer({ noServer: true });

  // ── Terminal WebSocket: /ws/terminal/:sessionId ────────────────────────────

  const terminalWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const pathname = (req.url ?? "").split("?")[0];

    // Route metrics stream
    if (pathname === "/ws/metrics/stream") {
      metricsWss.handleUpgrade(req, socket, head, (ws) => {
        metricsWss.emit("connection", ws, req);
      });
      return;
    }

    // Route deployment progress
    const deployMatch = /^\/ws\/deployments\/([^/]+)$/.exec(pathname);
    if (deployMatch) {
      const deploymentId = deployMatch[1];
      deploymentWss.handleUpgrade(req, socket, head, (ws) => {
        deploymentWss.emit("connection", ws, req, deploymentId);
      });
      return;
    }

    // Route terminal sessions
    const terminalMatch = /^\/ws\/terminal\/([^/]+)$/.exec(pathname);
    if (terminalMatch) {
      const sessionId = terminalMatch[1];
      terminalWss.handleUpgrade(req, socket, head, (ws) => {
        terminalWss.emit("connection", ws, req, sessionId);
      });
      return;
    }

    // Route main gateway (agents + browser clients)
    // Draupnir agent connects to /ws/agent; browser clients to /ws (or /ws/instances, /ws/fleet)
    if (
      pathname === "/ws" ||
      pathname === "/ws/agent" ||
      pathname === "/ws/instances" ||
      pathname === "/ws/fleet"
    ) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return;
    }

    // Unknown path — reject
    socket.destroy();
  });

  deploymentWss.on("connection", (ws: WebSocket, _req: IncomingMessage, deploymentId: string) => {
    logger.info({ deploymentId }, "Deployment progress WebSocket connected");

    const channel = REDIS_CHANNELS.deploymentProgress(deploymentId);

    // Send current deployment status from the database so the UI catches up
    // on any events that fired before the WebSocket connected.
    void db.deployment
      .findUnique({ where: { id: deploymentId } })
      .then((deployment) => {
        if (!deployment || ws.readyState !== WebSocket.OPEN) return;

        if (deployment.status === "FAILED") {
          ws.send(
            JSON.stringify({
              type: "error",
              deployment_id: deploymentId,
              message:
                deployment.error ?? "Deployment failed. Check your configuration and try again.",
              status: "FAILED",
            }),
          );
        } else if (deployment.status === "SUCCEEDED") {
          ws.send(
            JSON.stringify({
              type: "complete",
              deployment_id: deploymentId,
              message: "Instance is online and ready",
              status: "SUCCEEDED",
              progress_percent: 100,
              instance_id: deployment.instance_id,
            }),
          );
        } else if (deployment.status === "IN_PROGRESS") {
          ws.send(
            JSON.stringify({
              type: "status",
              deployment_id: deploymentId,
              message: "Deployment in progress...",
              status: "IN_PROGRESS",
              progress_percent: 40,
            }),
          );
        }
      })
      .catch((err: unknown) =>
        logger.warn({ err, deploymentId }, "Failed to fetch deployment status on WS connect"),
      );

    // Subscribe to deployment progress events from Redis
    const handleMessage = (_pattern: string, ch: string, message: string) => {
      if (ch === channel && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    };

    redisSub.psubscribe(`sindri:deployment:${deploymentId}:progress`, (err) => {
      if (err) logger.warn({ err, deploymentId }, "Failed to subscribe to deployment channel");
    });
    redisSub.on("pmessage", handleMessage);

    ws.on("close", () => {
      redisSub.removeListener("pmessage", handleMessage);
      logger.info({ deploymentId }, "Deployment progress WebSocket disconnected");
    });

    ws.on("error", (err) => {
      logger.warn({ err, deploymentId }, "Deployment WebSocket error");
    });
  });

  // ── Terminal WebSocket handler ──────────────────────────────────────────────
  // Browser connects here after creating a session via POST /api/v1/instances/:id/terminal.
  //
  // For Docker instances: spawns `docker exec -it <container> /bin/bash`
  // For cloud instances:  bridges to agent via Redis (future)

  terminalWss.on("connection", (ws: WebSocket, _req: IncomingMessage, sessionId: string) => {
    logger.info({ sessionId }, "Terminal WebSocket connected");

    // ── Check for an existing Docker PTY we can reattach to ───────────────
    const existing = persistentPtys.get(sessionId);
    if (existing && !existing.exited) {
      logger.info({ sessionId }, "Reattaching to existing PTY");

      if (existing.graceTimer) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = null;
      }

      existing.ws = ws;

      if (existing.buffer.length > 0) {
        ws.send(JSON.stringify({ type: "data", data: existing.buffer }));
        existing.buffer = "";
      }

      attachWsToPty(ws, existing);

      ws.on("error", (err) => {
        logger.warn({ err, sessionId }, "Terminal WebSocket error");
      });
      return;
    }

    // ── Check for an existing agent-bridged PTY we can reattach to ────────
    const existingBridged = agentBridgedPtys.get(sessionId);
    if (existingBridged && !existingBridged.exited) {
      logger.info({ sessionId }, "Reattaching to existing agent-bridged PTY");

      if (existingBridged.graceTimer) {
        clearTimeout(existingBridged.graceTimer);
        existingBridged.graceTimer = null;
      }

      existingBridged.ws = ws;

      if (existingBridged.buffer.length > 0) {
        ws.send(JSON.stringify({ type: "data", data: existingBridged.buffer }));
        existingBridged.buffer = "";
      }

      attachWsToAgentBridge(ws, existingBridged);

      ws.on("error", (err) => {
        logger.warn({ err, sessionId }, "Terminal WebSocket error");
      });
      return;
    }

    // ── No existing PTY — look up session and spawn ───────────────────────
    void db.terminalSession
      .findUnique({ where: { id: sessionId }, select: { instance_id: true } })
      .then(async (session) => {
        if (!session) {
          ws.close(4004, "Session not found");
          return;
        }

        const instance = await db.instance.findUnique({
          where: { id: session.instance_id },
          select: { name: true, provider: true },
        });

        if (!instance) {
          ws.close(4004, "Instance not found");
          return;
        }

        if (instance.provider === "docker") {
          spawnDockerTerminal(ws, instance.name, sessionId);
        } else {
          spawnAgentTerminal(ws, session.instance_id, sessionId);
        }
      })
      .catch((err: unknown) => {
        logger.error({ err, sessionId }, "Failed to look up terminal session");
        ws.close(4500, "Internal error");
      });

    ws.on("error", (err) => {
      logger.warn({ err, sessionId }, "Terminal WebSocket error");
    });
  });

  /**
   * Wire a WebSocket to an existing PersistentPty — browser input → PTY,
   * and handle WS close with grace period.
   */
  function attachWsToPty(ws: WebSocket, entry: PersistentPty) {
    ws.on("message", (raw) => {
      const str = Buffer.isBuffer(raw) ? raw.toString("utf-8") : String(raw);
      try {
        const msg = JSON.parse(str) as {
          type: string;
          data?: string;
          cols?: number;
          rows?: number;
        };
        if (msg.type === "data" && msg.data) {
          entry.term.write(msg.data);
        }
        if (msg.type === "resize" && msg.cols && msg.rows) {
          entry.term.resize(msg.cols, msg.rows);
        }
      } catch {
        entry.term.write(str);
      }
    });

    ws.on("close", () => {
      logger.info(
        { sessionId: entry.sessionId },
        "Terminal WebSocket disconnected — starting grace period",
      );
      entry.ws = null;

      // Start grace timer — kill PTY if nobody reconnects
      entry.graceTimer = setTimeout(() => {
        logger.info({ sessionId: entry.sessionId }, "PTY grace period expired, killing");
        entry.term.kill();
        persistentPtys.delete(entry.sessionId);
        closeTerminalSession(entry.sessionId, "grace_timeout").catch((err) =>
          logger.warn(
            { err, sessionId: entry.sessionId },
            "Failed to close terminal session after grace timeout",
          ),
        );
      }, PTY_GRACE_MS);
    });
  }

  function spawnDockerTerminal(ws: WebSocket, containerName: string, sessionId: string) {
    // Resolve the docker binary — check common locations since node-pty's
    // posix_spawnp may not find it if PATH is incomplete.
    let dockerBin = "";
    for (const p of ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "/usr/bin/docker"]) {
      if (existsSync(p)) {
        dockerBin = p;
        break;
      }
    }
    if (!dockerBin) {
      try {
        dockerBin = execFileSync("/usr/bin/which", ["docker"], { encoding: "utf-8" }).trim();
      } catch {
        dockerBin = "docker"; // last resort — let posix_spawnp try PATH
      }
    }

    logger.info({ sessionId, containerName, dockerBin }, "Spawning docker terminal");

    const term = pty.spawn(
      dockerBin,
      [
        "exec",
        "-it",
        "-u",
        "developer",
        "-e",
        "HOME=/alt/home/developer",
        "-w",
        "/alt/home/developer",
        containerName,
        "/bin/bash",
        "-l",
      ],
      {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        env: { ...process.env, TERM: "xterm-256color" },
      },
    );

    logger.info({ sessionId, containerName, pid: term.pid }, "Docker terminal spawned (node-pty)");

    // Register in the persistent PTY map
    const entry: PersistentPty = {
      term,
      containerName,
      sessionId,
      ws,
      graceTimer: null,
      buffer: "",
      exited: false,
      exitCode: null,
    };
    persistentPtys.set(sessionId, entry);

    // PTY output → browser (or buffer if disconnected)
    term.onData((data: string) => {
      if (entry.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify({ type: "data", data }));
      } else {
        // Buffer output while browser is away (up to max)
        if (entry.buffer.length < PTY_BUFFER_MAX) {
          entry.buffer += data;
          if (entry.buffer.length > PTY_BUFFER_MAX) {
            entry.buffer = entry.buffer.slice(-PTY_BUFFER_MAX);
          }
        }
      }
    });

    term.onExit(({ exitCode }) => {
      logger.info({ sessionId, exitCode }, "Docker terminal process exited");
      entry.exited = true;
      entry.exitCode = exitCode;

      if (entry.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(
          JSON.stringify({
            type: "data",
            data: `\r\n[Process exited with code ${exitCode}]\r\n`,
          }),
        );
        entry.ws.close(1000, "Process exited");
      }

      // Clean up: cancel any grace timer, remove from map, close DB session
      if (entry.graceTimer) {
        clearTimeout(entry.graceTimer);
        entry.graceTimer = null;
      }
      persistentPtys.delete(sessionId);
      closeTerminalSession(sessionId, "process_exit").catch((err) =>
        logger.warn({ err, sessionId }, "Failed to close terminal session on PTY exit"),
      );
    });

    // Wire browser input → PTY + handle disconnect with grace period
    attachWsToPty(ws, entry);
  }

  /**
   * Spawn a terminal session via the Draupnir agent.
   * Sends a terminal:create envelope to the agent and bridges the browser WS.
   */
  function spawnAgentTerminal(ws: WebSocket, instanceId: string, sessionId: string) {
    const agentConn = agentConnections.get(instanceId);
    if (!agentConn || agentConn.ws.readyState !== WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "data",
          data: "\r\n[Error: Agent is not connected. Cannot open terminal.]\r\n",
        }),
      );
      ws.close(4503, "Agent offline");
      return;
    }

    logger.info({ sessionId, instanceId }, "Spawning agent-bridged terminal");

    // Register in the agent-bridged PTY map BEFORE sending create to agent
    // (so any fast response will find the entry)
    const entry: AgentBridgedPty = {
      sessionId,
      instanceId,
      ws,
      graceTimer: null,
      buffer: "",
      exited: false,
      exitCode: null,
    };
    agentBridgedPtys.set(sessionId, entry);

    // Send terminal:create to Draupnir agent
    agentConn.ws.send(
      JSON.stringify({
        protocol_version: "1.0",
        type: "terminal:create",
        session_id: sessionId,
        payload: {
          session_id: sessionId,
          cols: 80,
          rows: 24,
        },
      }),
    );

    // Wire browser input → agent bridge
    attachWsToAgentBridge(ws, entry);
  }

  /**
   * Wire a browser WebSocket to an agent-bridged terminal session.
   * Translates browser messages into Draupnir envelope format.
   */
  function attachWsToAgentBridge(ws: WebSocket, entry: AgentBridgedPty) {
    ws.on("message", (raw) => {
      const str = Buffer.isBuffer(raw) ? raw.toString("utf-8") : String(raw);
      try {
        const msg = JSON.parse(str) as {
          type: string;
          data?: string;
          cols?: number;
          rows?: number;
        };

        const agentConn = agentConnections.get(entry.instanceId);
        if (!agentConn || agentConn.ws.readyState !== WebSocket.OPEN) {
          return; // Agent went away — output will be handled by disconnect cleanup
        }

        if (msg.type === "data" && msg.data) {
          // Browser sends plain UTF-8 — encode to base64 for Draupnir
          const b64 = Buffer.from(msg.data, "utf-8").toString("base64");
          agentConn.ws.send(
            JSON.stringify({
              protocol_version: "1.0",
              type: "terminal:input",
              session_id: entry.sessionId,
              payload: {
                session_id: entry.sessionId,
                data: b64,
              },
            }),
          );
        }

        if (msg.type === "resize" && msg.cols && msg.rows) {
          agentConn.ws.send(
            JSON.stringify({
              protocol_version: "1.0",
              type: "terminal:resize",
              session_id: entry.sessionId,
              payload: {
                session_id: entry.sessionId,
                cols: msg.cols,
                rows: msg.rows,
              },
            }),
          );
        }
      } catch {
        // If not JSON, treat as raw terminal input
        const agentConn = agentConnections.get(entry.instanceId);
        if (agentConn && agentConn.ws.readyState === WebSocket.OPEN) {
          const b64 = Buffer.from(str, "utf-8").toString("base64");
          agentConn.ws.send(
            JSON.stringify({
              protocol_version: "1.0",
              type: "terminal:input",
              session_id: entry.sessionId,
              payload: {
                session_id: entry.sessionId,
                data: b64,
              },
            }),
          );
        }
      }
    });

    ws.on("close", () => {
      logger.info(
        { sessionId: entry.sessionId },
        "Agent-bridged terminal WS disconnected — starting grace period",
      );
      entry.ws = null;

      // Start grace timer — close agent PTY if nobody reconnects
      entry.graceTimer = setTimeout(() => {
        logger.info(
          { sessionId: entry.sessionId },
          "Agent-bridged PTY grace period expired, closing",
        );

        // Send terminal:close to agent
        const agentConn = agentConnections.get(entry.instanceId);
        if (agentConn && agentConn.ws.readyState === WebSocket.OPEN) {
          agentConn.ws.send(
            JSON.stringify({
              protocol_version: "1.0",
              type: "terminal:close",
              session_id: entry.sessionId,
              payload: {
                session_id: entry.sessionId,
              },
            }),
          );
        }

        agentBridgedPtys.delete(entry.sessionId);
        closeTerminalSession(entry.sessionId, "grace_timeout").catch((err) =>
          logger.warn(
            { err, sessionId: entry.sessionId },
            "Failed to close bridged session after grace timeout",
          ),
        );
      }, PTY_GRACE_MS);
    });
  }

  return wss;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status introspection (for health checks and admin endpoints)
// ─────────────────────────────────────────────────────────────────────────────

export function getGatewayStatus() {
  return {
    agentCount: agentConnections.size,
    browserClientCount: browserConnections.size,
    connectedAgents: Array.from(agentConnections.keys()),
    agentBridgedTerminalCount: agentBridgedPtys.size,
  };
}
