# RBAC Authorization Model

Mimir uses a four-tier role-based access control (RBAC) model that combines a global system role with team-scoped membership roles to determine what each user can see and do.

---

## Role Hierarchy

| Role       | Scope       | Description                                                |
| ---------- | ----------- | ---------------------------------------------------------- |
| `ADMIN`    | Global      | Full access to all resources and admin operations          |
| `OPERATOR` | Global      | Read/write access to operational resources; no admin panel |
| `VIEWER`   | Global      | Read-only access to all visible resources                  |
| `MEMBER`   | Team-scoped | Access limited to team-assigned instances and resources    |

> **Note:** `MEMBER` users can also hold a team-level role (`OWNER` or `MEMBER`) which governs what they can do within that team's scope.

---

## Authorization Matrix

### Instances

| Action               | ADMIN | OPERATOR | VIEWER | MEMBER    |
| -------------------- | ----- | -------- | ------ | --------- |
| List all instances   | Yes   | Yes      | Yes    | Team only |
| View instance detail | Yes   | Yes      | Yes    | Team only |
| Create instance      | Yes   | Yes      | No     | No        |
| Update instance      | Yes   | Yes      | No     | No        |
| Delete instance      | Yes   | No       | No     | No        |
| Clone instance       | Yes   | Yes      | No     | No        |
| Redeploy instance    | Yes   | Yes      | No     | No        |

### Lifecycle (Config, Clone, Redeploy)

| Action              | ADMIN | OPERATOR | VIEWER | MEMBER    |
| ------------------- | ----- | -------- | ------ | --------- |
| Get instance config | Yes   | Yes      | Yes    | Team only |
| Clone instance      | Yes   | Yes      | No     | No        |
| Redeploy instance   | Yes   | Yes      | No     | No        |

### Commands

| Action               | ADMIN | OPERATOR | VIEWER | MEMBER    |
| -------------------- | ----- | -------- | ------ | --------- |
| View command history | Yes   | Yes      | Yes    | Team only |
| Dispatch command     | Yes   | Yes      | No     | No        |
| Bulk dispatch        | Yes   | Yes      | No     | No        |
| Run script           | Yes   | Yes      | No     | No        |

### Deployments

| Action            | ADMIN | OPERATOR | VIEWER | MEMBER    |
| ----------------- | ----- | -------- | ------ | --------- |
| Create deployment | Yes   | Yes      | No     | No        |
| View deployment   | Yes   | Yes      | Yes    | Team only |
| List providers    | Yes   | Yes      | Yes    | Yes       |

### Templates / Profiles

| Action        | ADMIN | OPERATOR | VIEWER | MEMBER |
| ------------- | ----- | -------- | ------ | ------ |
| List profiles | Yes   | Yes      | Yes    | Yes    |

### Scheduled Tasks

| Action           | ADMIN | OPERATOR | VIEWER | MEMBER    |
| ---------------- | ----- | -------- | ------ | --------- |
| List tasks       | Yes   | Yes      | Yes    | Team only |
| Create task      | Yes   | Yes      | No     | No        |
| Update task      | Yes   | Yes      | No     | No        |
| Delete task      | Yes   | No       | No     | No        |
| Pause / Resume   | Yes   | Yes      | No     | No        |
| Trigger manually | Yes   | Yes      | No     | No        |

### Alerts

| Action                       | ADMIN | OPERATOR | VIEWER | MEMBER    |
| ---------------------------- | ----- | -------- | ------ | --------- |
| List alerts                  | Yes   | Yes      | Yes    | Team only |
| Acknowledge / Resolve        | Yes   | Yes      | No     | No        |
| Manage alert rules           | Yes   | Yes      | No     | No        |
| Manage notification channels | Yes   | No       | No     | No        |

### Costs

| Action                 | ADMIN | OPERATOR | VIEWER | MEMBER |
| ---------------------- | ----- | -------- | ------ | ------ |
| View cost trends       | Yes   | Yes      | Yes    | No     |
| View cost breakdown    | Yes   | Yes      | Yes    | No     |
| Manage budgets         | Yes   | Yes      | No     | No     |
| View recommendations   | Yes   | Yes      | Yes    | No     |
| Dismiss recommendation | Yes   | Yes      | No     | No     |

### Extensions

| Action                 | ADMIN | OPERATOR | VIEWER | MEMBER |
| ---------------------- | ----- | -------- | ------ | ------ |
| List / view extensions | Yes   | Yes      | Yes    | Yes    |
| Create extension       | Yes   | Yes      | No     | No     |
| Update extension       | Yes   | Yes      | No     | No     |
| Delete extension       | Yes   | No       | No     | No     |
| Manage policies        | Yes   | Yes      | No     | No     |
| Record usage           | Yes   | Yes      | Yes    | Yes    |

### Security

| Action                 | ADMIN | OPERATOR | VIEWER | MEMBER |
| ---------------------- | ----- | -------- | ------ | ------ |
| View security summary  | Yes   | Yes      | Yes    | No     |
| View vulnerabilities   | Yes   | Yes      | Yes    | No     |
| Acknowledge / Fix vuln | Yes   | Yes      | No     | No     |
| Trigger scan           | Yes   | Yes      | No     | No     |
| View / rotate secrets  | Yes   | Yes      | No     | No     |
| View SSH keys          | Yes   | Yes      | Yes    | No     |
| Revoke SSH key         | Yes   | No       | No     | No     |
| View compliance report | Yes   | Yes      | Yes    | No     |

### Secrets (Drift module)

| Action              | ADMIN | OPERATOR | VIEWER | MEMBER    |
| ------------------- | ----- | -------- | ------ | --------- |
| List secrets        | Yes   | Yes      | Yes    | Team only |
| Create secret       | Yes   | Yes      | No     | No        |
| Update secret       | Yes   | Yes      | No     | No        |
| Delete secret       | Yes   | No       | No     | No        |
| Rotate secret       | Yes   | Yes      | No     | No        |
| Reveal secret value | Yes   | No       | No     | No        |

### Config Drift

| Action              | ADMIN | OPERATOR | VIEWER | MEMBER    |
| ------------------- | ----- | -------- | ------ | --------- |
| View drift summary  | Yes   | Yes      | Yes    | Team only |
| List snapshots      | Yes   | Yes      | Yes    | Team only |
| Trigger snapshot    | Yes   | Yes      | No     | No        |
| List drift events   | Yes   | Yes      | Yes    | Team only |
| Resolve event       | Yes   | Yes      | No     | No        |
| Create remediation  | Yes   | Yes      | No     | No        |
| Execute remediation | Yes   | No       | No     | No        |

### Admin Panel

| Action                    | ADMIN | OPERATOR | VIEWER | MEMBER |
| ------------------------- | ----- | -------- | ------ | ------ |
| View users list           | Yes   | No       | No     | No     |
| Create / update user      | Yes   | No       | No     | No     |
| Delete user               | Yes   | No       | No     | No     |
| View teams list           | Yes   | No       | No     | No     |
| Create / update team      | Yes   | No       | No     | No     |
| Delete team               | Yes   | No       | No     | No     |
| Assign instances to teams | Yes   | No       | No     | No     |
| View audit log            | Yes   | No       | No     | No     |

### Self-Service (all authenticated users)

| Action                           | Description        |
| -------------------------------- | ------------------ |
| `GET /api/v1/me`                 | View own profile   |
| `GET /api/v1/me/api-keys`        | List own API keys  |
| `POST /api/v1/me/api-keys`       | Create own API key |
| `DELETE /api/v1/me/api-keys/:id` | Revoke own API key |

---

## Team-Scoped Visibility

Users with role `MEMBER` only see resources that belong to teams they are members of. The API enforces this by filtering queries to include only instance IDs assigned to the user's teams.

### Example

A user is a `MEMBER` of the "Platform" team. That team has instances `inst-a` and `inst-b` assigned to it. When the user calls `GET /api/v1/instances`, they receive only `inst-a` and `inst-b`. Calls to any other instance return `403 Forbidden`.

### Effective Role Resolution Table

| User's Global Role | Team Membership | Effective Access                            |
| ------------------ | --------------- | ------------------------------------------- |
| `ADMIN`            | Any / none      | Full global access                          |
| `OPERATOR`         | Any / none      | Full operational access                     |
| `VIEWER`           | Any / none      | Read-only global access                     |
| `MEMBER`           | OWNER in team   | Operational access scoped to team instances |
| `MEMBER`           | MEMBER in team  | Read-only access scoped to team instances   |
| `MEMBER`           | No teams        | No instance access                          |

---

## Authentication Methods

Mimir supports three authentication methods, all managed by Better Auth:

1. **OAuth (GitHub / Google)** — social login via OIDC provider
2. **Magic Link** — passwordless email link (valid for 15 minutes)
3. **API Key** — for CLI and programmatic access; passed as `Authorization: Bearer <key>` header

Sessions are stored server-side and identified by an HTTP-only cookie (`mimir_session`). API key authentication bypasses session cookies entirely.

---

## Middleware Reference

| Middleware              | Location                             | Purpose                                                        |
| ----------------------- | ------------------------------------ | -------------------------------------------------------------- |
| `sessionMiddleware`     | `apps/api/src/middleware/session.ts` | Resolves session from cookie or API key; attaches `c.var.user` |
| `requireAuth`           | `apps/api/src/middleware/auth.ts`    | Rejects unauthenticated requests with `401`                    |
| `requireRole(...roles)` | `apps/api/src/middleware/auth.ts`    | Rejects requests where user role is not in allowed list        |
| `requireTeamAccess`     | `apps/api/src/middleware/auth.ts`    | For MEMBER users, filters or gates by team-assigned instances  |

---

## Frontend Enforcement

The frontend mirrors backend role checks to hide UI elements that users cannot access:

- The Admin sidebar tab and its sub-pages (Users, Teams, Permissions, Audit Log) are only rendered when `session.user.role === "ADMIN"`.
- The `AdminPage` component reads the role from `useSession()` and filters `TABS` accordingly.
- Write actions (create, update, delete buttons) are conditionally rendered based on role. However, the backend is the authoritative enforcement layer.

---

## Audit Trail

All mutating operations (create, update, delete, role change, team assignment) are recorded in the `AuditLog` table with:

- `user_id` — who performed the action
- `action` — verb (e.g. `create`, `update`, `delete`, `assign`)
- `resource` — resource type (e.g. `instance`, `user`, `team`)
- `resource_id` — affected resource ID
- `metadata` — JSON blob with before/after state or relevant context
- `created_at` — timestamp

Audit logs are accessible to `ADMIN` users via `GET /api/v1/audit` and the Audit Log tab in the Admin panel.
