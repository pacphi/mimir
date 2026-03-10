# ADR 0013: Instance Lifecycle State Machine Consolidation

- **Status:** Accepted
- **Date:** 2026-03-07
- **Deciders:** Core team

## Context

Instance destroy/deregister had three divergent implementations:

1. **Active route** (`routes/instances/lifecycle.ts`) hard-deleted the DB record via `db.instance.delete()`, losing all audit history for the instance.
2. **Service layer** (`services/lifecycle.ts`) soft-deleted to STOPPED, but was never called by the active route, and lacked infrastructure teardown.
3. **Deregister** (`services/instances.ts`) set status to STOPPED directly with its own inline DB logic, bypassing the lifecycle service entirely.

This meant:

- No single source of truth for state transitions
- Audit trail lost on explicit destroy
- No distinction between "workload stopped but infra exists" and "infra torn down"
- Inconsistent behavior depending on which code path was hit

## Decision

### 1. Consolidated Lifecycle Service

All destroy paths now delegate to `destroyInstance()` in `services/lifecycle.ts`, which is the single source of truth for state transitions. The route layer contains only HTTP concerns (parsing, auth, serialization).

### 2. New `DESTROYED` Terminal Status

Added `DESTROYED` to the `InstanceStatus` enum to distinguish between:

| Status     | Meaning                        | Infra?  | Resumable? |
| ---------- | ------------------------------ | ------- | ---------- |
| RUNNING    | Active, agent connected        | Yes     | N/A        |
| SUSPENDED  | User-initiated pause           | Yes     | Yes        |
| STOPPED    | Agent disconnected / user stop | Yes     | Yes        |
| ERROR      | Agent failure / lost conn      | Maybe   | Yes        |
| DEPLOYING  | Provisioning in progress       | Partial | No         |
| DESTROYING | Teardown in progress           | Partial | No         |
| DESTROYED  | Infra torn down, audit record  | No      | No         |
| UNKNOWN    | Initial/unresolved             | ?       | No         |

### 3. Soft-Delete Everywhere

All destroy paths now preserve the DB record. The `destroyInstance()` service method accepts a `skipInfraTeardown` option:

- **Full destroy** (default): tears down infrastructure via CLI, sets status to `DESTROYED`
- **Deregistration** (`skipInfraTeardown: true`): agent self-deregistering, sets status to `STOPPED` (infra may still exist)

### 4. Canonical Available Actions

A `getAvailableActions(status)` function defines which operations are valid per status:

- **RUNNING**: suspend, destroy, backup
- **SUSPENDED**: resume, destroy, backup
- **STOPPED**: resume, destroy
- **ERROR**: resume, destroy
- **DESTROYED/DEPLOYING/DESTROYING/UNKNOWN**: none

Status guards prevent invalid transitions (e.g., destroying an already-DESTROYED instance returns a 409 Conflict).

## Consequences

### Positive

- **Audit trail preserved**: Destroyed instances remain in the DB with `DESTROYED` status, visible and filterable in the UI
- **Consistent behavior**: All destroy paths go through the same service method with the same validations
- **Clear status semantics**: `DESTROYED` (infra gone, terminal) vs `STOPPED` (infra exists, resumable)
- **Single source of truth**: `services/lifecycle.ts` owns all state transitions; routes are thin HTTP wrappers

### Negative

- One additional DB enum value to track
- Destroyed instances accumulate in the DB over time (future consideration: archival/cleanup job)

## Files Changed

| File                                                    | Change                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/api/prisma/schema.prisma`                         | Added `DESTROYED` to `InstanceStatus` enum                                                         |
| `apps/api/src/services/lifecycle.ts`                    | Added `destroyInstanceInfra()`, status guards, `getAvailableActions()`, `skipInfraTeardown` option |
| `apps/api/src/routes/instances/lifecycle.ts`            | Delegated destroy to service; removed inline logic; added `GET /:id/lifecycle`                     |
| `apps/api/src/services/instances.ts`                    | Rewrote `deregisterInstance()` as thin wrapper calling lifecycle service                           |
| `apps/api/src/routes/instances.ts`                      | Added `DESTROYED` to list query Zod enum                                                           |
| `apps/api/src/routes/lifecycle.ts`                      | Deleted (dead file, not imported anywhere)                                                         |
| `apps/web/src/types/instance.ts`                        | Added `DESTROYED` to `InstanceStatus` union                                                        |
| `apps/web/src/components/instances/StatusBadge.tsx`     | Added DESTROYED config entry                                                                       |
| `apps/web/src/components/instances/InstanceFilters.tsx` | Added DESTROYED to filter options                                                                  |
| `apps/api/tests/instance-lifecycle.test.ts`             | Added CLI mock, adjusted for soft-delete flow, added available actions tests                       |
