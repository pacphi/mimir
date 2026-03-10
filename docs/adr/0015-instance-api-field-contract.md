# ADR 0015: Instance API Field Contract (camelCase)

**Date:** 2026-03-09
**Status:** Accepted

---

## Context

The instance detail page showed blank tiles for Uptime, Resource Usage, Metrics, Processes, and Events despite the API returning 200 responses with valid data. The root cause was a **field naming mismatch**: the API serialized all responses in camelCase (JavaScript convention) while the frontend TypeScript interfaces used snake_case (database convention).

Additionally:

- The WebSocket metrics stream published raw protocol envelopes that didn't match the frontend's expected `MetricsStreamMessage` format
- The event persistence in the WebSocket gateway hardcoded `event_type: "DEPLOY"` for all events
- The instance list response used `pagination: { total, page, pageSize }` but the frontend expected `{ total, page, per_page }`

---

## Decision

### Standardize on camelCase for all API responses

The API already had a clean serialization layer (`serializeInstance`, `serializeInstanceDetail`) that converted database snake_case fields to camelCase. Rather than changing the API (which could break other consumers), the **frontend types were updated to match the API's camelCase contract**.

### Frontend type changes

```typescript
// Before (snake_case — mismatched)
interface Heartbeat {
  cpu_percent: number;
  memory_used: number;
  // ...
}
interface Instance {
  latest_heartbeat?: Heartbeat;
  created_at: string;
  updated_at: string;
}

// After (camelCase — matches API)
interface Heartbeat {
  cpuPercent: number;
  memoryUsedBytes: string; // BigInt serialized as string
  // ...
}
interface Instance {
  lastHeartbeat?: Heartbeat;
  createdAt: string;
  updatedAt: string;
}
```

### WebSocket metrics stream normalization

The gateway now publishes a flat `metrics:snapshot` message to Redis instead of the raw protocol envelope:

```typescript
const snapshot = {
  type: "metrics:snapshot",
  instance_id: conn.instanceId,
  ts: metricsData.ts ?? Date.now(),
  cpu_percent: metricsData.cpuPercent ?? 0,
  // ...
};
```

This matches the `MetricsStreamMessage` interface the frontend expects, enabling real-time chart updates.

### Event type mapping

The WebSocket gateway now maps incoming event types to the Prisma `EventType` enum instead of hardcoding `"DEPLOY"`.

### Single WebSocket connection for metrics

`useMetricsStream` was called independently by both `MetricsCharts` and `NetworkChart`, creating duplicate WebSocket connections. Lifted to `InstanceDashboard` and passed as props.

---

## Consequences

### Positive

- Instance detail page renders all tiles correctly when data exists
- Real-time metrics stream works end-to-end
- Events are persisted with correct types
- Single WebSocket connection per instance view (was 2+)

### Negative

- All frontend consumers of `Instance` and `Heartbeat` types required updates (26+ files)
- BigInt fields are serialized as strings, requiring `Number()` conversion in the frontend

### Files Changed

| File                                               | Change                                        |
| -------------------------------------------------- | --------------------------------------------- |
| `apps/web/src/types/instance.ts`                   | Updated all interfaces to camelCase           |
| `apps/web/src/types/metrics.ts`                    | Verified MetricsStreamMessage format          |
| `apps/web/src/components/instances/*.tsx`          | Updated field references (6 files)            |
| `apps/web/src/hooks/useInstanceWebSocket.ts`       | Updated cache mutation field names            |
| `apps/web/src/hooks/useMetrics.ts`                 | Exported `RealtimePoints`, fixed WS reconnect |
| `apps/web/src/lib/api.ts`                          | Fixed `pageSize` query param                  |
| `apps/web/src/components/dashboard/instance/*.tsx` | Single WS connection, props for realtime data |
| `apps/api/src/agents/gateway.ts`                   | Metrics snapshot format, event type mapping   |
