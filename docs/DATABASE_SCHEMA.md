# Database Schema

ORM: Prisma 7 with `@prisma/adapter-pg`
Database: TimescaleDB (PostgreSQL 16)

## Instance Management

### Instance

Root aggregate for managed environments.

| Column           | Type             | Notes                                                 |
| ---------------- | ---------------- | ----------------------------------------------------- |
| `id`             | String           | PK (cuid)                                             |
| `name`           | String           | Indexed (not unique — allows reuse after destroy)     |
| `provider`       | String           | Cloud provider                                        |
| `region`         | String           | Provider region                                       |
| `extensions`     | String[]         | Installed extension names                             |
| `config_hash`    | String?          | SHA of declared config                                |
| `ssh_endpoint`   | String?          | SSH connection string                                 |
| `sindri_version` | String?          | Sindri CLI version reported by agent heartbeat        |
| `cli_target`     | String?          | Rust target triple (e.g. `x86_64-unknown-linux-musl`) |
| `status`         | `InstanceStatus` | Current status                                        |
| `team_id`        | String?          | FK → Team                                             |
| `created_at`     | DateTime         |                                                       |
| `updated_at`     | DateTime         |                                                       |

Relations: heartbeats, metrics, events, logs, terminal_sessions, command_executions, deployments, cost_entries, right_sizing_recommendation, vulnerabilities, bom_entries, secret_rotations, ssh_keys, config_snapshots

### Heartbeat

Coarse liveness ping (~10s interval). **TimescaleDB hypertable.**

| Column         | Type     | Notes                         |
| -------------- | -------- | ----------------------------- |
| `id`           | String   | Composite PK with `timestamp` |
| `instance_id`  | String   | FK → Instance                 |
| `timestamp`    | DateTime | Composite PK with `id`        |
| `cpu_percent`  | Float    |                               |
| `memory_used`  | BigInt   | bytes                         |
| `memory_total` | BigInt   | bytes                         |
| `disk_used`    | BigInt   | bytes                         |
| `disk_total`   | BigInt   | bytes                         |
| `uptime`       | Int      | seconds                       |

Index: `(instance_id, timestamp)`

### Metric

Fine-grained time-series data. **TimescaleDB hypertable.**

| Column          | Type     | Notes                         |
| --------------- | -------- | ----------------------------- |
| `id`            | String   | Composite PK with `timestamp` |
| `instance_id`   | String   | FK → Instance                 |
| `timestamp`     | DateTime | Composite PK with `id`        |
| `cpu_percent`   | Float    |                               |
| `load_avg_1`    | Float    | 1-min load average            |
| `load_avg_5`    | Float    | 5-min load average            |
| `load_avg_15`   | Float    | 15-min load average           |
| `mem_used`      | BigInt   | bytes                         |
| `mem_total`     | BigInt   | bytes                         |
| `disk_used`     | BigInt   | bytes                         |
| `disk_total`    | BigInt   | bytes                         |
| `net_bytes_in`  | BigInt   |                               |
| `net_bytes_out` | BigInt   |                               |
| `swap_used`     | BigInt   | bytes                         |
| `swap_total`    | BigInt   | bytes                         |

Index: `(instance_id, timestamp)`

> **Note:** Heartbeat and Metric tables have composite primary keys `(id, timestamp)` for TimescaleDB hypertable support. This diverges from the Prisma schema which shows `@id` on `id` only — the migration applies the composite PK directly.

### Event

Lifecycle events for instances.

| Column        | Type        | Notes                |
| ------------- | ----------- | -------------------- |
| `id`          | String      | PK                   |
| `instance_id` | String      | FK → Instance        |
| `event_type`  | `EventType` |                      |
| `timestamp`   | DateTime    |                      |
| `metadata`    | Json?       | Arbitrary event data |

## Users & Access Control

### User

| Column          | Type       | Notes                     |
| --------------- | ---------- | ------------------------- |
| `id`            | String     | PK                        |
| `email`         | String     | Unique                    |
| `name`          | String     |                           |
| `password_hash` | String?    | Nullable (SSO-only users) |
| `role`          | `UserRole` | Default: VIEWER           |
| `is_active`     | Boolean    | Default: true             |
| `last_login_at` | DateTime?  |                           |
| `created_at`    | DateTime   |                           |
| `updated_at`    | DateTime   |                           |

### Team

| Column        | Type     | Notes  |
| ------------- | -------- | ------ |
| `id`          | String   | PK     |
| `name`        | String   | Unique |
| `description` | String?  |        |
| `created_by`  | String   |        |
| `created_at`  | DateTime |        |
| `updated_at`  | DateTime |        |

### TeamMember

| Column      | Type             | Notes     |
| ----------- | ---------------- | --------- |
| `id`        | String           | PK        |
| `team_id`   | String           | FK → Team |
| `user_id`   | String           | FK → User |
| `role`      | `TeamMemberRole` |           |
| `joined_at` | DateTime         |           |

Unique: `(team_id, user_id)`

### ApiKey

| Column       | Type      | Notes           |
| ------------ | --------- | --------------- |
| `id`         | String    | PK              |
| `user_id`    | String    | FK → User       |
| `key_hash`   | String    | Unique, SHA-256 |
| `name`       | String    | Display name    |
| `created_at` | DateTime  |                 |
| `expires_at` | DateTime? |                 |

### AuditLog

| Column        | Type          | Notes         |
| ------------- | ------------- | ------------- |
| `id`          | String        | PK            |
| `user_id`     | String?       | FK → User     |
| `team_id`     | String?       | FK → Team     |
| `action`      | `AuditAction` |               |
| `resource`    | String        | Resource type |
| `resource_id` | String?       |               |
| `metadata`    | Json?         |               |
| `ip_address`  | String?       |               |
| `user_agent`  | String?       |               |
| `timestamp`   | DateTime      |               |

## Deployments

### DeploymentTemplate

| Column                     | Type     | Notes               |
| -------------------------- | -------- | ------------------- |
| `id`                       | String   | PK                  |
| `name`                     | String   |                     |
| `slug`                     | String   | Unique              |
| `category`                 | String?  |                     |
| `description`              | String?  |                     |
| `yaml_content`             | String   | sindri.yaml content |
| `extensions`               | String[] |                     |
| `provider_recommendations` | String[] |                     |
| `is_official`              | Boolean  | Default: false      |
| `created_by`               | String?  |                     |
| `created_at`               | DateTime |                     |
| `updated_at`               | DateTime |                     |

### Deployment

| Column         | Type               | Notes                   |
| -------------- | ------------------ | ----------------------- |
| `id`           | String             | PK                      |
| `instance_id`  | String             | FK → Instance           |
| `template_id`  | String?            | FK → DeploymentTemplate |
| `config_hash`  | String?            |                         |
| `yaml_content` | String             |                         |
| `provider`     | String             |                         |
| `region`       | String             |                         |
| `status`       | `DeploymentStatus` |                         |
| `initiated_by` | String?            |                         |
| `started_at`   | DateTime           |                         |
| `completed_at` | DateTime?          |                         |
| `logs`         | String?            |                         |
| `error`        | String?            |                         |

## Observability

### Log

| Column          | Type        | Notes             |
| --------------- | ----------- | ----------------- |
| `id`            | String      | PK                |
| `instance_id`   | String      | FK → Instance     |
| `level`         | `LogLevel`  |                   |
| `source`        | `LogSource` |                   |
| `message`       | String      | Full-text indexed |
| `metadata`      | Json?       |                   |
| `deployment_id` | String?     |                   |
| `timestamp`     | DateTime    |                   |

Indices: by level, source, `(instance_id, timestamp)`, `(instance_id, level)`, full-text on message

## Alerting

### AlertRule

| Column         | Type            | Notes                             |
| -------------- | --------------- | --------------------------------- |
| `id`           | String          | PK                                |
| `name`         | String          |                                   |
| `description`  | String?         |                                   |
| `type`         | `AlertRuleType` |                                   |
| `severity`     | `AlertSeverity` |                                   |
| `enabled`      | Boolean         | Default: true                     |
| `instance_id`  | String?         | FK → Instance (null = fleet-wide) |
| `conditions`   | Json            | Rule conditions                   |
| `cooldown_sec` | Int             | Default: 300                      |
| `created_by`   | String?         |                                   |
| `created_at`   | DateTime        |                                   |
| `updated_at`   | DateTime        |                                   |

### Alert

| Column            | Type            | Notes          |
| ----------------- | --------------- | -------------- |
| `id`              | String          | PK             |
| `rule_id`         | String          | FK → AlertRule |
| `instance_id`     | String?         | FK → Instance  |
| `status`          | `AlertStatus`   |                |
| `severity`        | `AlertSeverity` |                |
| `title`           | String          |                |
| `message`         | String          |                |
| `metadata`        | Json?           |                |
| `fired_at`        | DateTime        |                |
| `acknowledged_at` | DateTime?       |                |
| `acknowledged_by` | String?         |                |
| `resolved_at`     | DateTime?       |                |
| `resolved_by`     | String?         |                |
| `dedupe_key`      | String?         |                |

### NotificationChannel

| Column       | Type                      | Notes                   |
| ------------ | ------------------------- | ----------------------- |
| `id`         | String                    | PK                      |
| `name`       | String                    |                         |
| `type`       | `NotificationChannelType` |                         |
| `config`     | Json                      | Channel-specific config |
| `enabled`    | Boolean                   | Default: true           |
| `created_by` | String?                   |                         |
| `created_at` | DateTime                  |                         |
| `updated_at` | DateTime                  |                         |

### AlertRuleChannel

Many-to-many join. Composite PK: `(rule_id, channel_id)`.

### AlertNotification

| Column       | Type     | Notes                    |
| ------------ | -------- | ------------------------ |
| `id`         | String   | PK                       |
| `alert_id`   | String   | FK → Alert               |
| `channel_id` | String   | FK → NotificationChannel |
| `sent_at`    | DateTime |                          |
| `success`    | Boolean  |                          |
| `error`      | String?  |                          |
| `payload`    | Json?    |                          |

## Extensions

### Extension

| Column           | Type             | Notes          |
| ---------------- | ---------------- | -------------- |
| `id`             | String           | PK             |
| `name`           | String           | Unique         |
| `display_name`   | String           |                |
| `description`    | String?          |                |
| `category`       | String?          |                |
| `version`        | String           |                |
| `author`         | String?          |                |
| `license`        | String?          |                |
| `homepage_url`   | String?          |                |
| `icon_url`       | String?          |                |
| `tags`           | String[]         |                |
| `dependencies`   | String[]         |                |
| `scope`          | `ExtensionScope` |                |
| `is_official`    | Boolean          | Default: false |
| `is_deprecated`  | Boolean          | Default: false |
| `download_count` | Int              | Default: 0     |
| `created_at`     | DateTime         |                |
| `updated_at`     | DateTime         |                |
| `published_by`   | String?          |                |

### ExtensionUsage

| Column                | Type      | Notes          |
| --------------------- | --------- | -------------- |
| `id`                  | String    | PK             |
| `extension_id`        | String    | FK → Extension |
| `instance_id`         | String    | FK → Instance  |
| `version`             | String    |                |
| `installed_at`        | DateTime  |                |
| `removed_at`          | DateTime? |                |
| `install_duration_ms` | Int?      |                |
| `failed`              | Boolean   | Default: false |
| `error`               | String?   |                |

### ExtensionPolicy

| Column           | Type                    | Notes                         |
| ---------------- | ----------------------- | ----------------------------- |
| `id`             | String                  | PK                            |
| `extension_id`   | String                  | FK → Extension                |
| `instance_id`    | String?                 | FK → Instance (null = global) |
| `policy`         | `ExtensionUpdatePolicy` |                               |
| `pinned_version` | String?                 |                               |
| `created_by`     | String?                 |                               |
| `created_at`     | DateTime                |                               |
| `updated_at`     | DateTime                |                               |

Unique: `(extension_id, instance_id)`

## Security

### Vulnerability

| Column            | Type                    | Notes         |
| ----------------- | ----------------------- | ------------- |
| `id`              | String                  | PK            |
| `instance_id`     | String                  | FK → Instance |
| `cve_id`          | String?                 |               |
| `osv_id`          | String?                 |               |
| `package_name`    | String                  |               |
| `package_version` | String                  |               |
| `ecosystem`       | String                  |               |
| `severity`        | `VulnerabilitySeverity` |               |
| `cvss_score`      | Float?                  |               |
| `title`           | String                  |               |
| `description`     | String?                 |               |
| `fix_version`     | String?                 |               |
| `references`      | String[]                |               |
| `status`          | `VulnerabilityStatus`   |               |
| `detected_at`     | DateTime                |               |
| `acknowledged_at` | DateTime?               |               |
| `acknowledged_by` | String?                 |               |
| `fixed_at`        | DateTime?               |               |

### BomEntry

| Column            | Type     | Notes         |
| ----------------- | -------- | ------------- |
| `id`              | String   | PK            |
| `instance_id`     | String   | FK → Instance |
| `package_name`    | String   |               |
| `package_version` | String   |               |
| `ecosystem`       | String   |               |
| `license`         | String?  |               |
| `metadata`        | Json?    |               |
| `scanned_at`      | DateTime |               |

Unique: `(instance_id, package_name, package_version, ecosystem)`

### SecretRotation

| Column          | Type         | Notes          |
| --------------- | ------------ | -------------- |
| `id`            | String       | PK             |
| `instance_id`   | String       | FK → Instance  |
| `secret_name`   | String       |                |
| `secret_type`   | `SecretType` |                |
| `last_rotated`  | DateTime?    |                |
| `next_rotation` | DateTime?    |                |
| `rotation_days` | Int          | Default: 90    |
| `is_overdue`    | Boolean      | Default: false |
| `metadata`      | Json?        |                |
| `created_at`    | DateTime     |                |
| `updated_at`    | DateTime     |                |

### SshKey

| Column         | Type           | Notes         |
| -------------- | -------------- | ------------- |
| `id`           | String         | PK            |
| `instance_id`  | String         | FK → Instance |
| `fingerprint`  | String         |               |
| `comment`      | String?        |               |
| `key_type`     | String         |               |
| `key_bits`     | Int?           |               |
| `status`       | `SshKeyStatus` |               |
| `last_used_at` | DateTime?      |               |
| `created_at`   | DateTime       |               |
| `expires_at`   | DateTime?      |               |

Unique: `(instance_id, fingerprint)`

### Secret

| Column            | Type         | Notes         |
| ----------------- | ------------ | ------------- |
| `id`              | String       | PK            |
| `name`            | String       |               |
| `description`     | String?      |               |
| `type`            | `SecretType` |               |
| `instance_id`     | String?      | FK → Instance |
| `encrypted_val`   | String       |               |
| `scope`           | String[]     |               |
| `expires_at`      | DateTime?    |               |
| `created_by`      | String?      |               |
| `created_at`      | DateTime     |               |
| `updated_at`      | DateTime     |               |
| `last_rotated_at` | DateTime?    |               |

Unique: `(name, instance_id)`

## Configuration Drift

### ConfigSnapshot

| Column         | Type          | Notes                  |
| -------------- | ------------- | ---------------------- |
| `id`           | String        | PK                     |
| `instance_id`  | String        | FK → Instance          |
| `taken_at`     | DateTime      |                        |
| `declared`     | Json          | Declared configuration |
| `actual`       | Json          | Actual configuration   |
| `config_hash`  | String?       |                        |
| `drift_status` | `DriftStatus` |                        |
| `error`        | String?       |                        |

### DriftEvent

| Column         | Type            | Notes                     |
| -------------- | --------------- | ------------------------- |
| `id`           | String          | PK                        |
| `snapshot_id`  | String          | FK → ConfigSnapshot       |
| `instance_id`  | String          | FK → Instance             |
| `detected_at`  | DateTime        |                           |
| `field_path`   | String          | JSONPath of drifted field |
| `declared_val` | String?         |                           |
| `actual_val`   | String?         |                           |
| `severity`     | `DriftSeverity` |                           |
| `description`  | String?         |                           |
| `resolved_at`  | DateTime?       |                           |
| `resolved_by`  | String?         |                           |

### DriftRemediation

| Column           | Type                | Notes                   |
| ---------------- | ------------------- | ----------------------- |
| `id`             | String              | PK                      |
| `drift_event_id` | String              | Unique, FK → DriftEvent |
| `instance_id`    | String              | FK → Instance           |
| `action`         | String              |                         |
| `command`        | String?             |                         |
| `status`         | `RemediationStatus` |                         |
| `triggered_by`   | String?             |                         |
| `started_at`     | DateTime?           |                         |
| `completed_at`   | DateTime?           |                         |
| `output`         | String?             |                         |
| `error`          | String?             |                         |

## Scheduled Tasks

### ScheduledTask

| Column              | Type                  | Notes           |
| ------------------- | --------------------- | --------------- |
| `id`                | String                | PK              |
| `name`              | String                |                 |
| `description`       | String?               |                 |
| `cron`              | String                | Cron expression |
| `timezone`          | String                | Default: "UTC"  |
| `command`           | String                |                 |
| `instance_id`       | String?               | FK → Instance   |
| `status`            | `ScheduledTaskStatus` |                 |
| `template`          | String?               |                 |
| `timeout_sec`       | Int                   | Default: 300    |
| `max_retries`       | Int                   | Default: 0      |
| `notify_on_success` | Boolean               | Default: false  |
| `notify_on_failure` | Boolean               | Default: true   |
| `notify_emails`     | String[]              |                 |
| `last_run_at`       | DateTime?             |                 |
| `next_run_at`       | DateTime?             |                 |
| `created_at`        | DateTime              |                 |
| `updated_at`        | DateTime              |                 |
| `created_by`        | String?               |                 |

### TaskExecution

| Column         | Type                  | Notes              |
| -------------- | --------------------- | ------------------ |
| `id`           | String                | PK                 |
| `task_id`      | String                | FK → ScheduledTask |
| `instance_id`  | String?               | FK → Instance      |
| `status`       | `TaskExecutionStatus` |                    |
| `exit_code`    | Int?                  |                    |
| `stdout`       | String?               |                    |
| `stderr`       | String?               |                    |
| `started_at`   | DateTime              |                    |
| `finished_at`  | DateTime?             |                    |
| `duration_ms`  | Int?                  |                    |
| `triggered_by` | String?               |                    |

## Command Execution

### CommandExecution

| Column           | Type      | Notes          |
| ---------------- | --------- | -------------- |
| `id`             | String    | PK             |
| `instance_id`    | String    | FK → Instance  |
| `user_id`        | String    | FK → User      |
| `command`        | String    |                |
| `args`           | String[]  |                |
| `env`            | Json?     |                |
| `working_dir`    | String?   |                |
| `timeout_ms`     | Int       | Default: 30000 |
| `status`         | String    |                |
| `exit_code`      | Int?      |                |
| `stdout`         | String?   |                |
| `stderr`         | String?   |                |
| `duration_ms`    | Int?      |                |
| `correlation_id` | String    | Unique         |
| `script_content` | String?   |                |
| `created_at`     | DateTime  |                |
| `completed_at`   | DateTime? |                |

## Terminal Sessions

### TerminalSession

| Column        | Type                    | Notes         |
| ------------- | ----------------------- | ------------- |
| `id`          | String                  | PK            |
| `instance_id` | String                  | FK → Instance |
| `user_id`     | String                  | FK → User     |
| `started_at`  | DateTime                |               |
| `ended_at`    | DateTime?               |               |
| `status`      | `TerminalSessionStatus` |               |

## Cost Management

### CostEntry

| Column         | Type     | Notes          |
| -------------- | -------- | -------------- |
| `id`           | String   | PK             |
| `instance_id`  | String   | FK → Instance  |
| `provider`     | String   |                |
| `period_start` | DateTime |                |
| `period_end`   | DateTime |                |
| `compute_usd`  | Float    |                |
| `storage_usd`  | Float    |                |
| `network_usd`  | Float    |                |
| `total_usd`    | Float    |                |
| `currency`     | String   | Default: "USD" |
| `metadata`     | Json?    |                |
| `created_at`   | DateTime |                |

### Budget

| Column            | Type           | Notes              |
| ----------------- | -------------- | ------------------ |
| `id`              | String         | PK                 |
| `name`            | String         |                    |
| `amount_usd`      | Float          |                    |
| `period`          | `BudgetPeriod` |                    |
| `instance_id`     | String?        | FK → Instance      |
| `provider`        | String?        |                    |
| `alert_threshold` | Float          | Default: 0.8 (80%) |
| `alert_sent`      | Boolean        | Default: false     |
| `created_by`      | String?        |                    |
| `created_at`      | DateTime       |                    |
| `updated_at`      | DateTime       |                    |

### RightSizingRecommendation

| Column             | Type     | Notes                 |
| ------------------ | -------- | --------------------- |
| `id`               | String   | PK                    |
| `instance_id`      | String   | Unique, FK → Instance |
| `current_tier`     | String   |                       |
| `suggested_tier`   | String   |                       |
| `current_usd_mo`   | Float    |                       |
| `suggested_usd_mo` | Float    |                       |
| `savings_usd_mo`   | Float    |                       |
| `avg_cpu_percent`  | Float    |                       |
| `avg_mem_percent`  | Float    |                       |
| `confidence`       | Float    |                       |
| `generated_at`     | DateTime |                       |
| `dismissed`        | Boolean  | Default: false        |

## Enumerations

### Instance & Lifecycle

| Enum               | Values                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InstanceStatus`   | `RUNNING`, `STOPPED`, `DEPLOYING`, `DESTROYING`, `DESTROYED`, `SUSPENDED`, `ERROR`, `UNKNOWN`                                                                                                 |
| `EventType`        | `DEPLOY`, `REDEPLOY`, `CONNECT`, `DISCONNECT`, `BACKUP`, `RESTORE`, `DESTROY`, `SUSPEND`, `RESUME`, `EXTENSION_INSTALL`, `EXTENSION_REMOVE`, `HEARTBEAT_LOST`, `HEARTBEAT_RECOVERED`, `ERROR` |
| `DeploymentStatus` | `PENDING`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`, `CANCELLED`                                                                                                                                  |

### Users & Access

| Enum             | Values                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserRole`       | `ADMIN`, `OPERATOR`, `DEVELOPER`, `VIEWER`                                                                                                                                    |
| `TeamMemberRole` | `ADMIN`, `OPERATOR`, `DEVELOPER`, `VIEWER`                                                                                                                                    |
| `AuditAction`    | `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`, `DEPLOY`, `DESTROY`, `SUSPEND`, `RESUME`, `EXECUTE`, `CONNECT`, `DISCONNECT`, `PERMISSION_CHANGE`, `TEAM_ADD`, `TEAM_REMOVE` |

### Observability

| Enum                    | Values                                         |
| ----------------------- | ---------------------------------------------- |
| `LogLevel`              | `DEBUG`, `INFO`, `WARN`, `ERROR`               |
| `LogSource`             | `AGENT`, `EXTENSION`, `BUILD`, `APP`, `SYSTEM` |
| `TerminalSessionStatus` | `ACTIVE`, `CLOSED`, `DISCONNECTED`             |

### Alerting

| Enum                      | Values                                                  |
| ------------------------- | ------------------------------------------------------- |
| `AlertRuleType`           | `THRESHOLD`, `ANOMALY`, `LIFECYCLE`, `SECURITY`, `COST` |
| `AlertSeverity`           | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`             |
| `AlertStatus`             | `ACTIVE`, `ACKNOWLEDGED`, `RESOLVED`, `SILENCED`        |
| `NotificationChannelType` | `WEBHOOK`, `SLACK`, `EMAIL`, `IN_APP`                   |

### Extensions

| Enum                    | Values                          |
| ----------------------- | ------------------------------- |
| `ExtensionUpdatePolicy` | `AUTO_UPDATE`, `PIN`, `FREEZE`  |
| `ExtensionScope`        | `PUBLIC`, `PRIVATE`, `INTERNAL` |

### Security

| Enum                    | Values                                            |
| ----------------------- | ------------------------------------------------- |
| `VulnerabilitySeverity` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`    |
| `VulnerabilityStatus`   | `OPEN`, `ACKNOWLEDGED`, `FIXED`, `FALSE_POSITIVE` |
| `SshKeyStatus`          | `ACTIVE`, `REVOKED`, `EXPIRED`                    |
| `SecretType`            | `ENV_VAR`, `FILE`, `CERTIFICATE`, `API_KEY`       |

### Configuration Drift

| Enum                | Values                                                       |
| ------------------- | ------------------------------------------------------------ |
| `DriftStatus`       | `CLEAN`, `DRIFTED`, `UNKNOWN`, `ERROR`                       |
| `DriftSeverity`     | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`                          |
| `RemediationStatus` | `PENDING`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`, `DISMISSED` |

### Scheduling & Costs

| Enum                  | Values                                                            |
| --------------------- | ----------------------------------------------------------------- |
| `ScheduledTaskStatus` | `ACTIVE`, `PAUSED`, `DISABLED`                                    |
| `TaskExecutionStatus` | `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `SKIPPED`, `TIMED_OUT` |
| `BudgetPeriod`        | `DAILY`, `WEEKLY`, `MONTHLY`                                      |

## Migration Notes

- All tables, enums, indexes, and TimescaleDB hypertables are consolidated into a single `20260224000000_init` migration — this includes auth tables (Session, Account, Verification), geo columns, LLM usage tracking, the DESTROYED status, and non-unique instance name index
- Heartbeat, Metric, and LlmUsageEntry hypertables are created via raw SQL in the migration (not expressible in Prisma schema)
- Prisma 7 uses the adapter pattern: `@prisma/adapter-pg` with `PrismaPg({ connectionString })`
- `prisma.config.ts` at `apps/api/` holds the datasource URL and migration directory
