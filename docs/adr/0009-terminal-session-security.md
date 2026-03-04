# ADR 0009: Terminal Session Security

**Date:** 2026-03-03
**Status:** Accepted

---

## Context

Mimir's terminal relay (Browser <-> WSS <-> Mimir API <-> WS <-> Sindri Agent) sits on top of provider-specific auth mechanisms (Fly.io SSH keypairs, kubectl exec, DevPod-managed keys, RunPod SSH gateway, etc.). Security review identified several gaps:

1. **No RBAC enforcement** — any authenticated connection, including VIEWER role, could send `terminal:create` and obtain shell access.
2. **No audit trail** — terminal open/close events were not persisted or logged.
3. **No idle timeout** — abandoned sessions remained open indefinitely, increasing attack surface.
4. **No agent identity validation** — the `X-Instance-ID` header was trusted without verifying the instance exists in the database, allowing connections to claim arbitrary instance IDs.
5. **No session token** — no defense-in-depth mechanism to bind a terminal session to its creator.

### Options Considered

1. **Separate terminal auth service** — heavyweight; adds latency to every terminal message.
2. **Inline guards in WebSocket handlers** — lightweight; mirrors existing `handleCommandExec` VIEWER guard pattern. Chosen.
3. **Proxy-level enforcement** — does not cover internal WebSocket traffic between Mimir replicas.

---

## Decision

### A1. RBAC enforcement

Add DEVELOPER minimum role check in `handleTerminalCreate`. VIEWER connections receive a `FORBIDDEN` error envelope. Mirrors the existing pattern in `handleCommandExec`.

### A2. Session lifecycle persistence and audit logging

New `terminal-sessions.ts` service with two functions:

- `createTerminalSession(sessionId, instanceId, userId)` — upserts a `TerminalSession` record (status=ACTIVE) and emits `CONNECT` audit log.
- `closeTerminalSession(sessionId, reason?)` — updates status to CLOSED with `ended_at` timestamp and emits `DISCONNECT` audit log.

Both are injected into `HandlerContext` via the existing persistence callback pattern.

### A3. Idle session timeout

The keep-alive timer loop (30s interval) checks `terminalLastActivity` entries against `TERMINAL_IDLE_TIMEOUT_MS` (default: 3,600,000 ms / 1 hour). On timeout: sends `terminal:close` with `reason: "idle_timeout"`, calls `closeTerminalSession`, removes from tracking map.

Configurable via `TERMINAL_IDLE_TIMEOUT_MS` environment variable.

### A4. Agent identity validation

During WebSocket upgrade, if `X-Instance-ID` is present, validate the ID exists in the `Instance` table. Reject unknown IDs with `UNKNOWN_INSTANCE` auth error. Set `isAgent: boolean` on `AuthenticatedPrincipal`.

Agent-only handlers (`handleMetrics`, `handleHeartbeat`, `handleInstanceEvent`) check `ctx.principal.isAgent === true`.

### A5. Session token (defense in depth)

On `terminal:create`, generate a 32-byte random hex token stored in Redis (`ws:terminal:<sessionId>:token`, 5-min TTL). The token is included in the pub/sub payload to the agent. TTL is refreshed on each `terminal:data` message.

---

## Consequences

### Positive

- VIEWER users can no longer escalate to shell access
- Terminal session history is auditable and queryable
- Idle sessions are cleaned up automatically, reducing attack surface
- Agent connections are validated against the database
- Session tokens add a layer of defense against session hijacking

### Negative

- Agent identity validation adds one DB query per WebSocket upgrade (for agent connections only)
- Redis session token management adds minor overhead per terminal message

### Files Changed

| File                                         | Change                                                                |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `apps/api/src/services/terminal-sessions.ts` | New — persistence + audit                                             |
| `apps/api/src/websocket/handlers.ts`         | RBAC guard, audit calls, isAgent checks, session token, idle tracking |
| `apps/api/src/websocket/server.ts`           | HandlerContext extensions, idle timeout loop, ConnectedClient map     |
| `apps/api/src/websocket/auth.ts`             | Instance DB validation, isAgent field                                 |
| `apps/api/src/websocket/channels.ts`         | sessionToken in TerminalCreatePayload                                 |
| `apps/api/src/lib/env-validation.ts`         | TERMINAL_IDLE_TIMEOUT_MS                                              |
