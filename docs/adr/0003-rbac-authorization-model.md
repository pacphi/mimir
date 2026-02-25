# ADR 0003: RBAC Authorization Model

**Date:** 2026-02-24
**Status:** Accepted

---

## Context

Mimir manages infrastructure for multiple teams within an organization. Different users need different levels of access:

- Some users need full control (create/delete instances, manage users).
- Some users need operational access (deploy, command, manage tasks) but should not be able to delete resources or administer other users.
- Some users should only view dashboards and logs.
- Some users are contractors or team-specific operators who should only see the instances assigned to their team.

A flat "admin vs. non-admin" model was too coarse. A fully attribute-based access control (ABAC) system was considered too complex to implement and maintain given the team size and project scope.

---

## Decision

Implement a **four-tier global role hierarchy** combined with **team-scoped resource visibility**.

### Four Global Roles

| Role       | Numeric Level | Description                                              |
| ---------- | ------------- | -------------------------------------------------------- |
| `ADMIN`    | 4             | Full access; can manage users, teams, and all resources  |
| `OPERATOR` | 3             | Full operational access; no user/team administration     |
| `VIEWER`   | 2             | Read-only access to all resources visible at their scope |
| `MEMBER`   | 1             | Access limited to team-assigned instances only           |

Roles are stored on the `User` model as a string enum. The backend exposes a `requireRole(...roles)` middleware that checks `c.var.user.role` against an allowlist.

### Authorization Matrix (Summary)

| Resource           | ADMIN | OPERATOR | VIEWER | MEMBER    |
| ------------------ | ----- | -------- | ------ | --------- |
| Instances (read)   | All   | All      | All    | Team only |
| Instances (write)  | Yes   | Yes      | No     | No        |
| Instances (delete) | Yes   | No       | No     | No        |
| Commands           | R/W   | R/W      | R      | Team R    |
| Deployments        | R/W   | R/W      | R      | Team R    |
| Alerts (read)      | Yes   | Yes      | Yes    | Team only |
| Alerts (write)     | Yes   | Yes      | No     | No        |
| Costs              | Yes   | Yes      | Yes    | No        |
| Security           | Yes   | Yes      | R      | No        |
| Admin panel        | Yes   | No       | No     | No        |
| Self-service (/me) | Yes   | Yes      | Yes    | Yes       |

Full matrix is documented in [docs/RBAC.md](../RBAC.md).

### Team-Scoped Visibility

Users with role `MEMBER` are filtered to only see resources assigned to their teams:

1. At query time, the middleware resolves the user's team memberships.
2. Instance queries are filtered to `WHERE id IN (team_instance_ids)`.
3. Resource-level operations (GET /instances/:id, POST /commands, etc.) verify the target instance belongs to one of the user's teams.

This means `MEMBER` users receive `403 Forbidden` for any resource outside their team scope, not a filtered empty list — preventing enumeration.

### Effective Role Resolution

| Global Role | Team Role | Result                               |
| ----------- | --------- | ------------------------------------ |
| `ADMIN`     | —         | Full global access                   |
| `OPERATOR`  | —         | Full operational access              |
| `VIEWER`    | —         | Global read-only                     |
| `MEMBER`    | `OWNER`   | Operational access on team instances |
| `MEMBER`    | `MEMBER`  | Read-only on team instances          |
| `MEMBER`    | (none)    | No instance access                   |

### New User Provisioning

When a user authenticates for the first time (OAuth or magic link), they are created with role `VIEWER` by default. An `ADMIN` must explicitly:

1. Upgrade their role (e.g. to `OPERATOR`) via the Users admin panel, or
2. Add them to a team as a `MEMBER` or `OWNER`.

This prevents accidental privilege escalation from new sign-ups.

---

## Consequences

**Positive:**

- Simple to reason about: four roles, one check per route.
- Team scoping handles multi-tenant use cases without a separate tenancy model.
- New user provisioning defaults are safe (VIEWER with no team = minimal blast radius).
- Audit logging captures all role changes and team assignments.

**Negative:**

- The model is not fine-grained enough for organizations that need per-resource ACLs (e.g. "user X can only access instance Y but not instance Z within the same team"). If this becomes a requirement, migrating to ABAC or a permission-per-resource model will be necessary.
- `MEMBER` + `OWNER` team role gives operational access to all team instances, which may be broader than desired in large teams.

**Neutral:**

- The frontend mirrors role checks to hide inaccessible UI elements, but the backend remains the authoritative enforcement layer. Frontend checks are purely cosmetic.
- The `requireRole` middleware is composable: routes can require multiple allowed roles (e.g. `requireRole("ADMIN", "OPERATOR")`).
