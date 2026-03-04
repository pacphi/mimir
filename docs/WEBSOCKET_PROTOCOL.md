# WebSocket Protocol

Protocol version: `1.0`

## Connection

```
ws://localhost:3001/ws
```

### Authentication

WebSocket connections authenticate via:

- **Header**: `X-Api-Key: <api-key>`
- **Query param**: `?apiKey=<api-key>` (for browser clients)

### Agent vs Console

| Principal         | Headers                       | Purpose                          |
| ----------------- | ----------------------------- | -------------------------------- |
| Console (browser) | `X-Api-Key` or `?apiKey`      | Subscribe to instance data       |
| Agent (Draupnir)  | `X-Api-Key` + `X-Instance-ID` | Report metrics, heartbeats, logs |

> **Recommended:** Use the ticket-based auth flow (`POST /api/v1/ws/ticket`) instead of passing API keys in query parameters. Tickets are short-lived (30s), single-use, and Redis-backed — eliminating the risk of API keys appearing in access logs.

## Envelope Format

All WebSocket messages use a standard envelope:

```typescript
interface Envelope<T = unknown> {
  protocolVersion: string; // "1.0"
  channel: Channel; // Channel name
  type: MessageType; // Message discriminator
  instanceId?: string; // Set by server post-auth for agents
  correlationId?: string; // For request/response pairing
  ts: number; // Unix timestamp (ms)
  data: T; // Payload
}
```

Helper functions:

- `makeEnvelope(channel, type, data, opts?)` — Build a typed envelope
- `parseEnvelope(raw)` — Parse JSON string to Envelope (returns null on failure)

## Channels

### `metrics` — Instance Metrics

Direction: Agent → Console (every ~30s)

| Type             | Payload          |
| ---------------- | ---------------- |
| `metrics:update` | `MetricsPayload` |

```typescript
interface MetricsPayload {
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
```

### `heartbeat` — Liveness Pings

Direction: Agent → Console (every ~10s)

| Type             | Payload            |
| ---------------- | ------------------ |
| `heartbeat:ping` | `HeartbeatPayload` |
| `heartbeat:pong` | `HeartbeatPayload` |

```typescript
interface HeartbeatPayload {
  agentVersion: string;
  uptime: number; // seconds
  sindri_version?: string;
  cli_target?: string; // e.g., "x86_64-unknown-linux-musl"
}
```

### `logs` — Log Streaming

Direction: Agent → Console (streaming)

| Type        | Payload           |
| ----------- | ----------------- |
| `log:line`  | `LogLinePayload`  |
| `log:batch` | `LogBatchPayload` |

```typescript
interface LogLinePayload {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  source: string; // e.g., "init", "extension:python3", "agent"
  ts: number;
}

interface LogBatchPayload {
  lines: LogLinePayload[];
}
```

### `terminal` — Remote Terminal Sessions

Direction: Bidirectional (per session)

| Type               | Direction        | Payload                  |
| ------------------ | ---------------- | ------------------------ |
| `terminal:create`  | Console → Agent  | `TerminalCreatePayload`  |
| `terminal:created` | Agent → Console  | `TerminalCreatedPayload` |
| `terminal:data`    | Bidirectional    | `TerminalDataPayload`    |
| `terminal:resize`  | Console → Agent  | `TerminalResizePayload`  |
| `terminal:close`   | Either direction | `TerminalClosePayload`   |
| `terminal:error`   | Agent → Console  | `TerminalErrorPayload`   |

```typescript
interface TerminalCreatePayload {
  sessionId: string;
  cols: number;
  rows: number;
  shell?: string; // defaults to "/bin/bash"
  sessionToken?: string; // server-generated, included in pub/sub payload
}

interface TerminalCreatedPayload {
  sessionId: string;
  pid: number;
}

interface TerminalDataPayload {
  sessionId: string;
  data: string; // base64-encoded PTY data
}

interface TerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

interface TerminalClosePayload {
  sessionId: string;
  reason?: string;
}

interface TerminalErrorPayload {
  sessionId: string;
  message: string;
}
```

#### Terminal Channel Authorization

Terminal sessions require a minimum role of **DEVELOPER**. VIEWER connections receive a `FORBIDDEN` error on `terminal:create`. All session open/close events are recorded in the audit log. Idle sessions are automatically closed after `TERMINAL_IDLE_TIMEOUT_MS` (default: 1 hour).

**Session lifecycle:**

1. Console sends `terminal:create` with `sessionId`, `cols`, `rows` (requires DEVELOPER role)
2. Server generates a `sessionToken`, stores in Redis (5-min TTL), and creates a `TerminalSession` record + `CONNECT` audit log
3. Agent spawns PTY, responds with `terminal:created` (includes `pid`)
4. Bidirectional `terminal:data` streams base64-encoded I/O (refreshes session token TTL)
5. Console sends `terminal:resize` on window resize
6. Either side sends `terminal:close` to end session (creates `DISCONNECT` audit log)
7. Server closes idle sessions automatically after the configured timeout

### `events` — Instance Lifecycle Events

Direction: Agent → Console (on occurrence)

| Type             | Payload                |
| ---------------- | ---------------------- |
| `event:instance` | `InstanceEventPayload` |

```typescript
interface InstanceEventPayload {
  eventType: InstanceEventType;
  metadata?: Record<string, unknown>;
}
```

Event types: `deploy`, `redeploy`, `connect`, `disconnect`, `backup`, `restore`, `destroy`, `extension:install`, `extension:remove`, `heartbeat:lost`, `heartbeat:recovered`, `error`

### `commands` — Remote Command Execution

Direction: Console → Agent → Console

| Type             | Direction       | Payload                |
| ---------------- | --------------- | ---------------------- |
| `command:exec`   | Console → Agent | `CommandExecPayload`   |
| `command:result` | Agent → Console | `CommandResultPayload` |

```typescript
interface CommandExecPayload {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number; // ms
}

interface CommandResultPayload {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}
```

## System Messages

These can appear on any channel:

| Type    | Payload                             |
| ------- | ----------------------------------- |
| `error` | `{ code: string, message: string }` |
| `ack`   | `{ ok: true }`                      |

## Agent Registration Flow

1. Agent connects with `X-Api-Key` + `X-Instance-ID` headers
2. Server validates API key (SHA-256 hash lookup)
3. Server validates `X-Instance-ID` exists in the `Instance` database table (rejects unknown IDs)
4. Server sets `isAgent: true` on the authenticated principal
5. Server sends `ack` on success
6. Agent begins sending `heartbeat:ping` and `metrics:update`

> **Note:** Only agent connections (`isAgent: true`) may send `metrics:update`, `heartbeat:ping`, and `event:instance` messages. Browser clients attempting these will receive a `FORBIDDEN` error.

## Browser Subscription Flow

1. Browser connects with `?apiKey=<key>`
2. Server validates API key
3. Browser receives real-time data via Redis pub/sub fanout
4. All agent messages for subscribed instances are forwarded
