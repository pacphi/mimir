# ADR 0016: Instance Identity and Name Reuse

- **Status:** Accepted
- **Date:** 2026-03-12
- **Deciders:** Core team
- **Supersedes:** Partially extends ADR 0013

## Context

The original instance model used `name` as a unique key (`@unique` in Prisma). When an instance was destroyed, its DB record was preserved for audit (per ADR 0013), but this prevented creating a new instance with the same name. The `upsert`-based flow would silently reuse the old record, merging new deployment data with historical events and metrics.

This created several problems:

1. **Historical data contamination**: Redeploying over a DESTROYED instance carried forward old events, metrics, and logs into what should be a fresh instance.
2. **Name lock-in**: Users couldn't reuse a familiar name (e.g., `sindri-dev01`) after destroying the old instance.
3. **Redeploy identity loss**: The redeploy flow (which should update the _same_ instance) was incorrectly creating new records after the `upsert` was replaced with `create`.

## Decision

### 1. Remove Unique Constraint on Instance Name

`Instance.name` is no longer `@unique`. Multiple records with the same name can coexist — one active, zero or more historical (DESTROYED/ERROR). A regular `@@index([name])` ensures query performance.

**Migration:** Folded into `20260224000000_init` (consolidated single migration)

### 2. Two Distinct Deploy Paths

| Path           | Trigger                                         | Instance Record                   | Use Case                                                       |
| -------------- | ----------------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| **New deploy** | Deployment wizard, API `POST /deployments`      | `db.instance.create()` — fresh ID | First deploy, or reusing a name from DESTROYED/ERROR instances |
| **Redeploy**   | Redeploy button, `POST /instances/:id/redeploy` | `db.instance.update()` — same ID  | Re-provisioning an existing active instance                    |

The distinction is made via the `existingInstanceId` field on `CreateDeploymentInput`:

- **Set** (redeploy): updates the existing record, preserves ID/events/metrics
- **Unset** (new deploy): creates a fresh record, old ones preserved separately

### 3. Name Conflict Rules (New Deploy Only)

| Existing instances with same name          | Behavior                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| None                                       | Create normally                                                               |
| All DESTROYED or ERROR                     | Create new record; auto-set `--force` for CLI to clean up leftover containers |
| Any in RUNNING/STOPPED/SUSPENDED/DEPLOYING | **Block** with 409 Conflict (unless `force` flag is set)                      |

### 4. State Transition Matrix for Deploy/Redeploy

Extends the table from ADR 0013:

| Current State | New Deploy (same name)            | Redeploy                                  |
| ------------- | --------------------------------- | ----------------------------------------- |
| RUNNING       | Blocked (name conflict)           | Allowed — sets DEPLOYING, `--force` CLI   |
| STOPPED       | Blocked (name conflict)           | Allowed — sets DEPLOYING, `--force` CLI   |
| SUSPENDED     | Blocked (name conflict)           | Allowed — sets DEPLOYING, `--force` CLI   |
| ERROR         | Allowed (fresh ID, old preserved) | Allowed — sets DEPLOYING, `--force` CLI   |
| DESTROYED     | Allowed (fresh ID, old preserved) | Not applicable (no redeploy on DESTROYED) |
| DEPLOYING     | Blocked                           | Only with `force` flag                    |
| DESTROYING    | Blocked                           | Only with `force` flag                    |

## Consequences

### Positive

- **Clean history**: Each instance lifecycle (deploy → run → destroy) has its own record with isolated events, metrics, and logs
- **Name reuse**: Users can recreate instances with familiar names without manual cleanup
- **Redeploy preserves identity**: Redeploying doesn't break WebSocket connections, metric continuity, or instance URLs
- **Backward compatible**: Existing API consumers see the same response shapes

### Negative

- Application-level uniqueness check required (no DB-enforced unique constraint)
- Multiple records with the same name requires care in queries (always filter by status or use ID)
- The `registerInstance` service (agent registration) must find-or-create by name+status to avoid duplicates

## Files Changed

| File                                              | Change                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/api/prisma/schema.prisma`                   | Removed `@unique` from `Instance.name`, added `@@index([name])`                      |
| `apps/api/prisma/migrations/20260224000000_init/` | Consolidated SQL migration (name index change folded in)                             |
| `apps/api/src/services/deployments.ts`            | Added `existingInstanceId` to input; two-path instance resolution (create vs update) |
| `apps/api/src/services/instances.ts`              | `registerInstance` uses find-first + create/update instead of upsert                 |
| `apps/api/src/routes/instances/lifecycle.ts`      | Redeploy passes `existingInstanceId`; clone uses `findFirst` for name check          |
| `apps/api/src/routes/instances.ts`                | Removed duplicate `/:id/config` route                                                |
| `apps/web/src/lib/yaml-assembler.ts`              | Always emits image config; dev/prod mode distinction                                 |
| `apps/api/src/websocket/channels.ts`              | `parseEnvelope` bridges Draupnir agent protocol to Mimir envelope format             |
| `apps/api/src/agents/gateway.ts`                  | Normalizes Draupnir heartbeat/metrics field names; `HOME` fix for Docker terminals   |
