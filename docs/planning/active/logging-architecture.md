# Instance Log Streaming Architecture

**Status:** Draft
**Date:** 2026-03-12
**Author:** Generated during Mimir development session

---

## 1. Problem Statement

The Instance detail page and Logs page currently show "No logs found" because:

1. Logs exist **inside the container** (`~/.sindri/logs/`) but Mimir has no mechanism to retrieve them
2. The existing `Log` DB model expects logs to be pushed from the agent, but Draupnir doesn't implement log forwarding yet
3. Multiple log sources exist per instance (install log, draupnir agent log, per-extension logs, service logs) with no discovery mechanism
4. Some logs are static (install.log — written once at boot) while others are live (draupnir.log, service logs)

## 2. Log Sources Inside a Sindri Instance

| Log File         | Path                                    | Type   | Description                             |
| ---------------- | --------------------------------------- | ------ | --------------------------------------- |
| Install log      | `~/.sindri/logs/install.log`            | Static | Extension installation output from boot |
| Draupnir agent   | `~/.sindri/logs/draupnir.log`           | Live   | Agent lifecycle, WebSocket, heartbeat   |
| Draupnir service | `~/.sindri/logs/draupnir-service.log`   | Live   | Service management output               |
| Extension logs   | `~/.sindri/logs/<ext-name>/`            | Mixed  | Per-extension install and runtime logs  |
| Support files    | `~/.sindri/logs/support-files-init.log` | Static | Support file initialization             |
| System logs      | `/var/log/syslog`, `journalctl`         | Live   | OS-level logs                           |

## 3. Existing Infrastructure

### What We Have

- **DB Model**: `Log` table with `instance_id`, `level` (DEBUG/INFO/WARN/ERROR), `source` (AGENT/EXTENSION/BUILD/APP/SYSTEM), `message`, `metadata`, `deployment_id`, `timestamp`. Indexed on `[instance_id, timestamp]`, `[instance_id, level]`, `[level]`, `[source]`, `[timestamp]`, `[deployment_id]`.
- **Query API**: `GET /api/v1/logs` (fleet-wide) and `GET /api/v1/instances/:id/logs` (instance-scoped). Support filters: `level` (comma-separated), `source` (comma-separated), `search` (substring), `deploymentId`, `from`/`to` (ISO datetime). Pagination via `page`/`pageSize` (max 500).
- **Ingest API**: `POST /api/v1/logs/ingest` (single) and `POST /api/v1/logs/ingest/batch` (up to 1000 entries). Ready to receive logs from any source.
- **SSE Streaming**: `GET /api/v1/logs/stream` (fleet-wide) and `GET /api/v1/instances/:id/logs/stream` (per-instance). Already implemented with Redis pub/sub, 30s heartbeat pings. **Not yet used by the frontend.**
- **Stats API**: `GET /api/v1/logs/stats` and `GET /api/v1/instances/:id/logs/stats`. Returns total, byLevel, bySource, topInstances.
- **WebSocket Protocol**: `CHANNEL.LOGS` with `MESSAGE_TYPE.LOG_LINE` and `MESSAGE_TYPE.LOG_BATCH` defined in channels.ts. Payload types defined but not mapped in `DRAUPNIR_TYPE_MAP`.
- **UI Components**: `LogAggregator` component with level/source filter dropdowns, search, pagination, and clear functionality. Uses TanStack Query for polling. Monospace dark-themed table display.
- **Command Dispatch**: Draupnir now handles `command:dispatch` — can execute arbitrary commands and return stdout.

### What's Missing

- Draupnir doesn't send logs to Mimir (no log message types in protocol, not mapped in `DRAUPNIR_TYPE_MAP`)
- No log file discovery mechanism (what logs exist inside the container?)
- Frontend doesn't use the existing SSE streaming endpoints
- LogAggregator only supports single-value level/source filters despite API supporting comma-separated
- The Log table is empty because nothing writes to it — ingest endpoints exist but no producer calls them

## 4. Proposed Architecture

### Phase 1: Log Retrieval via Command Dispatch + SSE Streaming

Combine command dispatch (for container log files) with the existing SSE endpoints (for DB-persisted logs). No Draupnir protocol changes required.

**Two data paths:**

```
Path A — Container log files (on-demand via command dispatch):
  Browser → Mimir API → WebSocket → Draupnir (command:dispatch)
                                          ↓
                                     exec: find/tail ~/.sindri/logs/...
                                          ↓
                                     command:result → Mimir API → Browser

Path B — Persisted logs (real-time via existing SSE):
  Browser → SSE → GET /api/v1/instances/:id/logs/stream
                       ↓
                  Redis pub/sub ← log ingest API ← Draupnir (future) or command dispatch
```

**Implementation:**

1. **Log Discovery Endpoint**: `GET /api/v1/instances/:id/logs/sources`
   - Dispatches `find ~/.sindri/logs -name "*.log" -type f -exec stat --format='%n %s %Y' {} \;`
   - Returns `{ sources: [{ path, name, sizeBytes, lastModified }] }`
   - UI renders as a dropdown/tab selector

2. **Log Retrieval Endpoint**: `GET /api/v1/instances/:id/logs/file?path=<relative>&lines=500&offset=0`
   - Dispatches `tail -n <lines> ~/.sindri/logs/<path>` (with path validation)
   - Returns `{ lines: string[], totalLines: number, path: string }`
   - Path is validated against `~/.sindri/logs/` prefix to prevent directory traversal

3. **Wire SSE into LogAggregator:**
   - Connect to `GET /api/v1/instances/:id/logs/stream` for real-time updates
   - New DB-persisted logs appear automatically (no refresh needed)
   - Fall back to polling if SSE connection fails

4. **UI Integration:**
   - LogAggregator gets two modes: "DB logs" (existing, now with SSE) and "Container files" (new, via command dispatch)
   - Source selector shows both: DB log sources (AGENT/EXTENSION/BUILD/APP/SYSTEM) and container file sources (discovered files)
   - Multi-select level/source filters (align UI with API capability)

**Pros:** Leverages existing SSE and ingest infrastructure, works for container files immediately
**Cons:** Container file path is poll-based, two different data paths to manage

### Phase 2: Real-Time Log Streaming (via Draupnir `log:stream`)

Add a new Draupnir capability that tails log files and streams new lines over WebSocket.

**Draupnir Changes:**

1. New message types in protocol:
   - Inbound: `log:subscribe` — `{ paths: ["install.log", "draupnir.log"] }`
   - Inbound: `log:unsubscribe` — `{ paths: [...] }`
   - Outbound: `log:line` — `{ path, line, timestamp, level? }`
   - Outbound: `log:batch` — `{ path, lines: [...] }`

2. New `internal/logstream/` package:
   - Uses `fsnotify` or `tail -f` subprocess to watch log files
   - Buffers lines and flushes as batches every 100ms (or 50 lines, whichever first)
   - Respects subscription list — only streams files the console asked for
   - Handles log rotation (file truncation, rename)

**Mimir API Changes:**

1. Map Draupnir's `log:line`/`log:batch` to the existing `CHANNEL.LOGS` messages
2. Optionally persist log lines to the `Log` DB table for historical search
3. Forward real-time lines to subscribed browser clients via Redis pub/sub

**UI Changes:**

1. LogAggregator connects to WebSocket for real-time updates
2. New lines appear at the bottom with auto-scroll
3. Pause/resume button to freeze the stream for reading
4. Historical lines loaded from DB on scroll-up (infinite scroll)

**Pros:** Real-time, low latency, feels like a terminal
**Cons:** Requires Draupnir update, more complex state management

### Phase 3: Structured Log Ingestion (Optional Future)

For production deployments with many instances, add structured log forwarding:

1. Draupnir parses log lines (JSON structured logs from sindri CLI, syslog format for system)
2. Extracts level, source, structured metadata
3. Sends as `log:batch` with parsed fields
4. Mimir persists to TimescaleDB `Log` hypertable for efficient time-range queries
5. Enables fleet-wide log search across all instances from the Logs page

## 5. UI Design

### Instance Detail Page — Logs Section

```
┌─────────────────────────────────────────────────────┐
│ Logs                                                │
│ ┌──────────────┐ ┌──────────┐ ┌──────────┐ 🔍 Search│
│ │ install.log ▼│ │All levels│ │ Auto-refresh ☐    │
│ └──────────────┘ └──────────┘ └──────────┘         │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [INFO] Installing extension: agent-skills-cli...│ │
│ │ [INFO] Using bundled extension from /opt/sindri │ │
│ │ [INFO] Successfully installed agent-skills-cli  │ │
│ │ [WARN] mise install attempt 1 failed...         │ │
│ │ [ERROR] Failed to install python                │ │
│ │ ...                                             │ │
│ │                            [Load more ↑]        │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Logs Page (Fleet-Wide)

The existing Logs page should work as-is once Phase 3 populates the Log table. For Phases 1-2, the Logs page can show a per-instance view with the same source selector.

## 6. Security Considerations

- **Path traversal**: All log file paths must be validated against `~/.sindri/logs/` prefix. Reject paths with `..`, absolute paths, or symlinks outside the log directory.
- **Size limits**: Cap retrieved log content at 1MB per request to prevent memory issues.
- **Rate limiting**: Log retrieval endpoints should use the existing rate limiter.
- **Sensitive data**: Log lines may contain secrets (API keys in error messages). Consider redaction patterns for known secret formats.

## 7. Implementation Order

1. **Phase 1** (this sprint): Poll-based log retrieval via command dispatch
   - Add log discovery and retrieval API endpoints
   - Update LogAggregator UI to use source selector and fetch from instance
   - ~2-3 hours of work

2. **Phase 2** (next sprint): Real-time streaming
   - Implement `logstream` package in Draupnir
   - Add subscription management in Mimir gateway
   - Update UI with real-time append and pause/resume
   - ~1-2 days of work

3. **Phase 3** (future): Structured ingestion for fleet search
   - Design based on actual usage patterns from Phases 1-2
   - Consider whether TimescaleDB or a dedicated log store (Loki, ClickHouse) is more appropriate

## 8. Files to Change

### Phase 1

| File                                             | Change                                                 |
| ------------------------------------------------ | ------------------------------------------------------ |
| `apps/api/src/routes/metrics.ts`                 | Add `/:id/logs/sources` and `/:id/logs/file` endpoints |
| `apps/api/src/agents/gateway.ts`                 | Add helper to dispatch command and await result        |
| `apps/web/src/components/logs/LogAggregator.tsx` | Add source selector, fetch from instance               |
| `apps/web/src/lib/metricsApi.ts`                 | Add `logSources()` and `logFile()` API methods         |
| `apps/web/src/hooks/useMetrics.ts`               | Add `useLogSources()` and `useLogFile()` hooks         |

### Phase 2

| File                                             | Change                                         |
| ------------------------------------------------ | ---------------------------------------------- |
| `draupnir/internal/logstream/`                   | New package: file watcher + line buffering     |
| `draupnir/pkg/protocol/messages.go`              | Add log subscribe/unsubscribe/line/batch types |
| `draupnir/cmd/agent/main.go`                     | Wire logstream manager into handler            |
| `apps/api/src/websocket/channels.ts`             | Map Draupnir log messages to Mimir channels    |
| `apps/api/src/agents/gateway.ts`                 | Handle log subscription forwarding             |
| `apps/web/src/components/logs/LogAggregator.tsx` | WebSocket streaming mode                       |
