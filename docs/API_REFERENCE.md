# API Reference

Base URL: `http://localhost:3001`

## Authentication

All endpoints (except `/health`) require an API key:

```
Authorization: Bearer <api-key>
```

Or:

```
X-Api-Key: <api-key>
```

API keys are stored as SHA-256 hashes. The raw key is never persisted.

## Pagination

Paginated endpoints accept:

| Param   | Type   | Default | Description                             |
| ------- | ------ | ------- | --------------------------------------- |
| `page`  | number | `1`     | Page number                             |
| `limit` | number | `20`    | Items per page (max varies by endpoint) |

Paginated responses include:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8
  }
}
```

## Error Format

```json
{
  "error": "Not Found",
  "message": "Instance not found",
  "statusCode": 404
}
```

---

## Health

| Method | Path      | Auth | Description                               |
| ------ | --------- | ---- | ----------------------------------------- |
| `GET`  | `/health` | None | Service health check (DB + Redis latency) |

## Version

| Method | Path              | Auth | Description                                           |
| ------ | ----------------- | ---- | ----------------------------------------------------- |
| `GET`  | `/api/v1/version` | Any  | API version, Sindri CLI version, min instance version |

## Fleet Overview

| Method | Path                        | Min Role | Description                                                     |
| ------ | --------------------------- | -------- | --------------------------------------------------------------- |
| `GET`  | `/api/v1/fleet/stats`       | VIEWER   | Aggregate status counts, provider distribution, active sessions |
| `GET`  | `/api/v1/fleet/geo`         | VIEWER   | Instance locations as geo pins                                  |
| `GET`  | `/api/v1/fleet/deployments` | VIEWER   | 24-hour deployment activity timeline                            |

## Instances

| Method   | Path                    | Min Role | Description                            |
| -------- | ----------------------- | -------- | -------------------------------------- |
| `POST`   | `/api/v1/instances`     | VIEWER   | Register or re-register an instance    |
| `GET`    | `/api/v1/instances`     | VIEWER   | List instances (filterable, paginated) |
| `GET`    | `/api/v1/instances/:id` | VIEWER   | Instance details + last heartbeat      |
| `DELETE` | `/api/v1/instances/:id` | OPERATOR | Deregister instance                    |

**Query params** (GET list): `status`, `provider`, `region`, `search`, `page`, `limit`

## Instance Lifecycle

| Method   | Path                              | Min Role | Description                          |
| -------- | --------------------------------- | -------- | ------------------------------------ |
| `POST`   | `/api/v1/instances/:id/suspend`   | OPERATOR | Suspend a running instance           |
| `POST`   | `/api/v1/instances/:id/resume`    | OPERATOR | Resume a suspended instance          |
| `DELETE` | `/api/v1/instances/:id`           | OPERATOR | Destroy instance (optional backup)   |
| `POST`   | `/api/v1/instances/:id/backup`    | OPERATOR | Backup instance volume               |
| `POST`   | `/api/v1/instances/bulk-action`   | OPERATOR | Bulk suspend/resume/destroy          |
| `GET`    | `/api/v1/instances/:id/lifecycle` | VIEWER   | Available actions for current status |

## Metrics

| Method | Path                               | Min Role | Description                                      |
| ------ | ---------------------------------- | -------- | ------------------------------------------------ |
| `GET`  | `/api/v1/metrics/timeseries`       | VIEWER   | Fleet/instance time-series (range: 1h/6h/24h/7d) |
| `GET`  | `/api/v1/metrics/timeseries/range` | VIEWER   | Advanced timeseries with from/to + granularity   |
| `GET`  | `/api/v1/metrics/aggregate`        | VIEWER   | Aggregate stats over time window                 |
| `GET`  | `/api/v1/metrics/latest`           | VIEWER   | Most recent snapshot per instance                |
| `GET`  | `/api/v1/instances/:id/metrics`    | VIEWER   | Instance-scoped timeseries                       |
| `GET`  | `/api/v1/instances/:id/processes`  | VIEWER   | Top processes from latest heartbeat              |
| `GET`  | `/api/v1/instances/:id/extensions` | VIEWER   | Extension status for instance                    |
| `GET`  | `/api/v1/instances/:id/events`     | VIEWER   | Recent events timeline                           |

## Logs

| Method | Path                                        | Min Role | Description                              |
| ------ | ------------------------------------------- | -------- | ---------------------------------------- |
| `GET`  | `/api/v1/logs`                              | VIEWER   | Query/search logs (full-text, paginated) |
| `GET`  | `/api/v1/logs/stats`                        | VIEWER   | Fleet-wide log statistics                |
| `GET`  | `/api/v1/logs/stream`                       | VIEWER   | SSE stream for real-time log tailing     |
| `POST` | `/api/v1/logs/ingest`                       | VIEWER   | Ingest single log entry                  |
| `POST` | `/api/v1/logs/ingest/batch`                 | VIEWER   | Bulk ingest (up to 1000 entries)         |
| `GET`  | `/api/v1/logs/:id`                          | VIEWER   | Get single log entry                     |
| `GET`  | `/api/v1/instances/:instanceId/logs`        | VIEWER   | Instance-scoped log query                |
| `GET`  | `/api/v1/instances/:instanceId/logs/stats`  | VIEWER   | Instance log statistics                  |
| `GET`  | `/api/v1/instances/:instanceId/logs/stream` | VIEWER   | SSE stream for instance logs             |

**Query params** (GET list): `instanceId`, `level`, `source`, `search`, `from`, `to`, `page`, `limit`

## Alerts

| Method | Path                              | Min Role | Description                         |
| ------ | --------------------------------- | -------- | ----------------------------------- |
| `GET`  | `/api/v1/alerts`                  | VIEWER   | List alerts (filterable, paginated) |
| `GET`  | `/api/v1/alerts/summary`          | VIEWER   | Severity/status counts              |
| `GET`  | `/api/v1/alerts/:id`              | VIEWER   | Alert detail                        |
| `POST` | `/api/v1/alerts/:id/acknowledge`  | OPERATOR | Acknowledge alert                   |
| `POST` | `/api/v1/alerts/:id/resolve`      | OPERATOR | Resolve alert                       |
| `POST` | `/api/v1/alerts/bulk-acknowledge` | OPERATOR | Bulk acknowledge                    |
| `POST` | `/api/v1/alerts/bulk-resolve`     | OPERATOR | Bulk resolve                        |

### Alert Rules

| Method   | Path                               | Min Role | Description                        |
| -------- | ---------------------------------- | -------- | ---------------------------------- |
| `GET`    | `/api/v1/alerts/rules`             | VIEWER   | List rules (filterable, paginated) |
| `POST`   | `/api/v1/alerts/rules`             | OPERATOR | Create alert rule                  |
| `GET`    | `/api/v1/alerts/rules/:id`         | VIEWER   | Rule detail                        |
| `PUT`    | `/api/v1/alerts/rules/:id`         | OPERATOR | Update rule                        |
| `DELETE` | `/api/v1/alerts/rules/:id`         | OPERATOR | Delete rule                        |
| `POST`   | `/api/v1/alerts/rules/:id/enable`  | OPERATOR | Enable rule                        |
| `POST`   | `/api/v1/alerts/rules/:id/disable` | OPERATOR | Disable rule                       |

### Notification Channels

| Method   | Path                               | Min Role | Description    |
| -------- | ---------------------------------- | -------- | -------------- |
| `GET`    | `/api/v1/alerts/channels`          | VIEWER   | List channels  |
| `POST`   | `/api/v1/alerts/channels`          | OPERATOR | Create channel |
| `GET`    | `/api/v1/alerts/channels/:id`      | VIEWER   | Channel detail |
| `PUT`    | `/api/v1/alerts/channels/:id`      | OPERATOR | Update channel |
| `DELETE` | `/api/v1/alerts/channels/:id`      | OPERATOR | Delete channel |
| `POST`   | `/api/v1/alerts/channels/:id/test` | OPERATOR | Test channel   |

## Commands

| Method | Path                       | Min Role  | Description                           |
| ------ | -------------------------- | --------- | ------------------------------------- |
| `POST` | `/api/v1/commands`         | DEVELOPER | Execute command on instance           |
| `POST` | `/api/v1/commands/bulk`    | OPERATOR  | Bulk command dispatch                 |
| `POST` | `/api/v1/commands/script`  | DEVELOPER | Upload and execute script             |
| `GET`  | `/api/v1/commands/history` | VIEWER    | Command execution history (paginated) |
| `GET`  | `/api/v1/commands/:id`     | VIEWER    | Command execution detail              |

## Deployments

| Method | Path                      | Min Role | Description                        |
| ------ | ------------------------- | -------- | ---------------------------------- |
| `POST` | `/api/v1/deployments`     | VIEWER   | Create deployment with YAML config |
| `GET`  | `/api/v1/deployments/:id` | VIEWER   | Deployment status and details      |

## Deployment Templates

| Method   | Path                          | Min Role | Description                            |
| -------- | ----------------------------- | -------- | -------------------------------------- |
| `GET`    | `/api/v1/templates`           | VIEWER   | List templates (filterable, paginated) |
| `POST`   | `/api/v1/templates`           | OPERATOR | Create template                        |
| `GET`    | `/api/v1/templates/:idOrSlug` | VIEWER   | Get template by ID or slug             |
| `DELETE` | `/api/v1/templates/:id`       | ADMIN    | Delete template                        |

## Costs

| Method | Path                                        | Min Role | Description                           |
| ------ | ------------------------------------------- | -------- | ------------------------------------- |
| `GET`  | `/api/v1/costs/summary`                     | VIEWER   | Overall cost summary for date range   |
| `GET`  | `/api/v1/costs/trends`                      | VIEWER   | Daily cost trend data                 |
| `GET`  | `/api/v1/costs/idle`                        | VIEWER   | Idle instance list                    |
| `GET`  | `/api/v1/costs/idle-instances`              | VIEWER   | Idle instances (alias)                |
| `GET`  | `/api/v1/costs/pricing`                     | VIEWER   | Provider pricing tables               |
| `GET`  | `/api/v1/costs/instances/:id`               | VIEWER   | Per-instance cost breakdown           |
| `GET`  | `/api/v1/costs/breakdown`                   | VIEWER   | Fleet-wide cost breakdown             |
| `GET`  | `/api/v1/costs/alerts`                      | VIEWER   | Budget alerts for exceeded thresholds |
| `GET`  | `/api/v1/costs/recommendations`             | VIEWER   | Right-sizing recommendations          |
| `POST` | `/api/v1/costs/recommendations/:id/dismiss` | OPERATOR | Dismiss recommendation                |
| `POST` | `/api/v1/costs/recommendations/analyze`     | OPERATOR | Trigger analysis                      |

### Budgets

| Method   | Path                        | Min Role | Description           |
| -------- | --------------------------- | -------- | --------------------- |
| `GET`    | `/api/v1/costs/budgets`     | VIEWER   | List budgets          |
| `POST`   | `/api/v1/costs/budgets`     | OPERATOR | Create budget         |
| `GET`    | `/api/v1/costs/budgets/:id` | VIEWER   | Budget detail         |
| `PUT`    | `/api/v1/costs/budgets/:id` | OPERATOR | Update budget         |
| `PATCH`  | `/api/v1/costs/budgets/:id` | OPERATOR | Update budget (alias) |
| `DELETE` | `/api/v1/costs/budgets/:id` | OPERATOR | Delete budget         |

## Configuration Drift

| Method | Path                                          | Min Role | Description                       |
| ------ | --------------------------------------------- | -------- | --------------------------------- |
| `GET`  | `/api/v1/drift/summary`                       | VIEWER   | Drift overview with status counts |
| `GET`  | `/api/v1/drift/snapshots`                     | VIEWER   | List snapshots (paginated)        |
| `GET`  | `/api/v1/drift/snapshots/:id`                 | VIEWER   | Snapshot detail                   |
| `POST` | `/api/v1/drift/snapshots/:instanceId/trigger` | OPERATOR | Manual drift check                |
| `GET`  | `/api/v1/drift/events`                        | VIEWER   | List drift events (paginated)     |
| `POST` | `/api/v1/drift/events/:id/resolve`            | OPERATOR | Resolve drift event               |
| `POST` | `/api/v1/drift/events/:id/remediate`          | OPERATOR | Create remediation                |
| `POST` | `/api/v1/drift/remediations/:id/execute`      | OPERATOR | Execute remediation               |
| `POST` | `/api/v1/drift/remediations/:id/dismiss`      | OPERATOR | Dismiss remediation               |
| `GET`  | `/api/v1/drift/instances/:instanceId/latest`  | VIEWER   | Latest snapshot for instance      |

## Extensions

| Method   | Path                                  | Min Role | Description                    |
| -------- | ------------------------------------- | -------- | ------------------------------ |
| `GET`    | `/api/v1/extensions`                  | VIEWER   | List/search extension registry |
| `GET`    | `/api/v1/extensions/categories`       | VIEWER   | List categories with counts    |
| `GET`    | `/api/v1/extensions/summary`          | VIEWER   | Fleet-wide extension summary   |
| `GET`    | `/api/v1/extensions/:id`              | VIEWER   | Extension detail               |
| `POST`   | `/api/v1/extensions`                  | OPERATOR | Register new extension         |
| `PUT`    | `/api/v1/extensions/:id`              | OPERATOR | Update extension metadata      |
| `DELETE` | `/api/v1/extensions/:id`              | ADMIN    | Remove extension               |
| `GET`    | `/api/v1/extensions/:id/analytics`    | VIEWER   | Install time and failure rates |
| `GET`    | `/api/v1/extensions/:id/dependencies` | VIEWER   | Resolved dependency graph      |
| `GET`    | `/api/v1/extensions/usage/matrix`     | VIEWER   | Usage heatmap matrix           |
| `POST`   | `/api/v1/extensions/usage`            | VIEWER   | Record install/removal         |

### Extension Policies

| Method   | Path                                                | Min Role | Description                     |
| -------- | --------------------------------------------------- | -------- | ------------------------------- |
| `GET`    | `/api/v1/extensions/policies`                       | VIEWER   | List all policies               |
| `POST`   | `/api/v1/extensions/policies`                       | OPERATOR | Set/upsert policy               |
| `DELETE` | `/api/v1/extensions/policies/:id`                   | OPERATOR | Delete policy                   |
| `GET`    | `/api/v1/extensions/policies/effective/:instanceId` | VIEWER   | Effective policies for instance |

## Scheduled Tasks

| Method   | Path                        | Min Role | Description                   |
| -------- | --------------------------- | -------- | ----------------------------- |
| `GET`    | `/api/v1/tasks/templates`   | VIEWER   | List task templates           |
| `GET`    | `/api/v1/tasks`             | VIEWER   | List tasks (paginated)        |
| `POST`   | `/api/v1/tasks`             | VIEWER   | Create scheduled task         |
| `GET`    | `/api/v1/tasks/:id`         | VIEWER   | Task detail                   |
| `PUT`    | `/api/v1/tasks/:id`         | VIEWER   | Update task                   |
| `DELETE` | `/api/v1/tasks/:id`         | VIEWER   | Delete task                   |
| `POST`   | `/api/v1/tasks/:id/pause`   | VIEWER   | Pause task                    |
| `POST`   | `/api/v1/tasks/:id/resume`  | VIEWER   | Resume task                   |
| `POST`   | `/api/v1/tasks/:id/trigger` | VIEWER   | Trigger task manually         |
| `GET`    | `/api/v1/tasks/:id/history` | VIEWER   | Execution history (paginated) |

## Security

| Method | Path                                                  | Min Role | Description                                 |
| ------ | ----------------------------------------------------- | -------- | ------------------------------------------- |
| `GET`  | `/api/v1/security/summary`                            | VIEWER   | Fleet-wide security summary + score         |
| `GET`  | `/api/v1/security/vulnerabilities`                    | VIEWER   | Vulnerability list (paginated)              |
| `GET`  | `/api/v1/security/vulnerabilities/:id`                | VIEWER   | Vulnerability detail                        |
| `POST` | `/api/v1/security/vulnerabilities/:id/acknowledge`    | VIEWER   | Acknowledge vulnerability                   |
| `POST` | `/api/v1/security/vulnerabilities/:id/fix`            | VIEWER   | Mark vulnerability fixed                    |
| `POST` | `/api/v1/security/vulnerabilities/:id/false-positive` | VIEWER   | Mark as false positive                      |
| `GET`  | `/api/v1/security/bom`                                | VIEWER   | BOM entries (optionally scoped by instance) |
| `POST` | `/api/v1/security/scan/:instanceId`                   | VIEWER   | Trigger BOM scan + CVE detection            |
| `GET`  | `/api/v1/security/compliance`                         | VIEWER   | Compliance report                           |

### Secret Rotations

| Method | Path                                  | Min Role | Description             |
| ------ | ------------------------------------- | -------- | ----------------------- |
| `GET`  | `/api/v1/security/secrets`            | VIEWER   | Secret rotation records |
| `POST` | `/api/v1/security/secrets`            | VIEWER   | Upsert rotation record  |
| `POST` | `/api/v1/security/secrets/:id/rotate` | VIEWER   | Mark secret as rotated  |

### SSH Keys

| Method | Path                                   | Min Role | Description        |
| ------ | -------------------------------------- | -------- | ------------------ |
| `GET`  | `/api/v1/security/ssh-keys`            | VIEWER   | SSH key audit list |
| `POST` | `/api/v1/security/ssh-keys`            | VIEWER   | Register SSH key   |
| `POST` | `/api/v1/security/ssh-keys/:id/revoke` | VIEWER   | Revoke SSH key     |

## Secrets Vault

| Method   | Path                         | Min Role | Description                             |
| -------- | ---------------------------- | -------- | --------------------------------------- |
| `GET`    | `/api/v1/secrets`            | VIEWER   | List secrets (metadata only, no values) |
| `POST`   | `/api/v1/secrets`            | OPERATOR | Create secret                           |
| `GET`    | `/api/v1/secrets/:id`        | VIEWER   | Secret metadata                         |
| `PUT`    | `/api/v1/secrets/:id`        | OPERATOR | Update secret                           |
| `DELETE` | `/api/v1/secrets/:id`        | OPERATOR | Delete secret                           |
| `POST`   | `/api/v1/secrets/:id/rotate` | OPERATOR | Rotate secret value                     |
| `GET`    | `/api/v1/secrets/:id/value`  | ADMIN    | Reveal decrypted value                  |

## Providers

| Method | Path                                   | Min Role | Description              |
| ------ | -------------------------------------- | -------- | ------------------------ |
| `GET`  | `/api/v1/providers`                    | VIEWER   | List supported providers |
| `GET`  | `/api/v1/providers/:provider/regions`  | VIEWER   | Regions for provider     |
| `GET`  | `/api/v1/providers/:provider/vm-sizes` | VIEWER   | VM sizes for provider    |

## Profiles

| Method | Path               | Min Role | Description             |
| ------ | ------------------ | -------- | ----------------------- |
| `GET`  | `/api/v1/profiles` | VIEWER   | List extension profiles |

## Registry (Live from Sindri CLI)

| Method | Path                                     | Min Role | Description                   |
| ------ | ---------------------------------------- | -------- | ----------------------------- |
| `GET`  | `/api/v1/registry/extensions`            | VIEWER   | Extensions from Sindri binary |
| `GET`  | `/api/v1/registry/extensions/categories` | VIEWER   | Derived categories            |
| `GET`  | `/api/v1/registry/profiles`              | VIEWER   | Profiles from CLI             |
| `GET`  | `/api/v1/registry/version`               | VIEWER   | Sindri CLI version info       |

## Audit

| Method | Path            | Min Role | Description                 |
| ------ | --------------- | -------- | --------------------------- |
| `GET`  | `/api/v1/audit` | ADMIN    | List audit logs (paginated) |

**Query params**: `user_id`, `team_id`, `action`, `resource`, `resource_id`, `from`, `to`, `page`, `limit`
