-- Consolidated initial migration for Mimir
-- Single baseline: all tables, enums, hypertables, and indexes in their final form.

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────

-- TimescaleDB: IF NOT EXISTS handles the case where the extension is already installed.
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums (all values in their final form)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "InstanceStatus" AS ENUM (
  'RUNNING', 'STOPPED', 'DEPLOYING', 'DESTROYING', 'DESTROYED', 'SUSPENDED', 'ERROR', 'UNKNOWN'
);

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'DEVELOPER', 'VIEWER');

CREATE TYPE "TerminalSessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'DISCONNECTED');

CREATE TYPE "EventType" AS ENUM (
  'DEPLOY', 'REDEPLOY', 'CONNECT', 'DISCONNECT', 'BACKUP', 'RESTORE',
  'DESTROY', 'SUSPEND', 'RESUME',
  'EXTENSION_INSTALL', 'EXTENSION_REMOVE',
  'HEARTBEAT_LOST', 'HEARTBEAT_RECOVERED', 'ERROR'
);

CREATE TYPE "DeploymentStatus" AS ENUM (
  'PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED'
);

CREATE TYPE "ScheduledTaskStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

CREATE TYPE "TaskExecutionStatus" AS ENUM (
  'PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED', 'TIMED_OUT'
);

CREATE TYPE "LogLevel"  AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');
CREATE TYPE "LogSource" AS ENUM ('AGENT', 'EXTENSION', 'BUILD', 'APP', 'SYSTEM');

CREATE TYPE "AlertRuleType"           AS ENUM ('THRESHOLD', 'ANOMALY', 'LIFECYCLE', 'SECURITY', 'COST');
CREATE TYPE "AlertSeverity"           AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');
CREATE TYPE "AlertStatus"             AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'SILENCED');
CREATE TYPE "NotificationChannelType" AS ENUM ('WEBHOOK', 'SLACK', 'EMAIL', 'IN_APP');

CREATE TYPE "TeamMemberRole" AS ENUM ('ADMIN', 'OPERATOR', 'DEVELOPER', 'VIEWER');

CREATE TYPE "AuditAction" AS ENUM (
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT',
  'DEPLOY', 'DESTROY', 'SUSPEND', 'RESUME', 'EXECUTE',
  'CONNECT', 'DISCONNECT', 'PERMISSION_CHANGE', 'TEAM_ADD', 'TEAM_REMOVE'
);

CREATE TYPE "ExtensionUpdatePolicy" AS ENUM ('AUTO_UPDATE', 'PIN', 'FREEZE');
CREATE TYPE "ExtensionScope"        AS ENUM ('PUBLIC', 'PRIVATE', 'INTERNAL');

CREATE TYPE "VulnerabilitySeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');
CREATE TYPE "VulnerabilityStatus"   AS ENUM ('OPEN', 'ACKNOWLEDGED', 'FIXED', 'FALSE_POSITIVE');
CREATE TYPE "SshKeyStatus"          AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TYPE "DriftStatus"       AS ENUM ('CLEAN', 'DRIFTED', 'UNKNOWN', 'ERROR');
CREATE TYPE "DriftSeverity"     AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "RemediationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'DISMISSED');
CREATE TYPE "SecretType"        AS ENUM ('ENV_VAR', 'FILE', 'CERTIFICATE', 'API_KEY');

CREATE TYPE "BudgetPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables (dependency order)
-- ─────────────────────────────────────────────────────────────────────────────

-- Instance
CREATE TABLE "Instance" (
    "id"           TEXT              NOT NULL,
    "name"         TEXT              NOT NULL,
    "provider"     TEXT              NOT NULL,
    "region"       TEXT,
    "extensions"   TEXT[]            NOT NULL DEFAULT ARRAY[]::TEXT[],
    "config_hash"  TEXT,
    "ssh_endpoint" TEXT,
    "status"       "InstanceStatus"  NOT NULL DEFAULT 'UNKNOWN',
    "team_id"      TEXT,
    "geo_lat"      DOUBLE PRECISION,
    "geo_lon"      DOUBLE PRECISION,
    "geo_label"    TEXT,
    "geo_source"   TEXT,
    "created_at"   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    CONSTRAINT "Instance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Instance_name_idx"           ON "Instance" ("name");
CREATE INDEX "Instance_status_idx"         ON "Instance" ("status");
CREATE INDEX "Instance_provider_idx"       ON "Instance" ("provider");
CREATE INDEX "Instance_created_at_idx"     ON "Instance" ("created_at");
CREATE INDEX "Instance_team_id_idx"        ON "Instance" ("team_id");
CREATE INDEX "Instance_geo_lat_geo_lon_status_idx" ON "Instance" ("geo_lat", "geo_lon", "status");

-- User (with all columns in final form)
CREATE TABLE "User" (
    "id"             TEXT        NOT NULL,
    "email"          TEXT        NOT NULL,
    "name"           TEXT,
    "password_hash"  TEXT,
    "role"           "UserRole"  NOT NULL DEFAULT 'VIEWER',
    "is_active"      BOOLEAN     NOT NULL DEFAULT TRUE,
    "email_verified" BOOLEAN     NOT NULL DEFAULT FALSE,
    "image"          TEXT,
    "last_login_at"  TIMESTAMPTZ,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key"  ON "User" ("email");
CREATE INDEX "User_email_idx"        ON "User" ("email");
CREATE INDEX "User_role_idx"         ON "User" ("role");
CREATE INDEX "User_is_active_idx"    ON "User" ("is_active");

-- Team
CREATE TABLE "Team" (
    "id"          TEXT        NOT NULL,
    "name"        TEXT        NOT NULL,
    "description" TEXT,
    "created_by"  TEXT,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Team_name_key"    ON "Team" ("name");
CREATE INDEX "Team_name_idx"          ON "Team" ("name");
CREATE INDEX "Team_created_at_idx"    ON "Team" ("created_at");

-- ApiKey
CREATE TABLE "ApiKey" (
    "id"           TEXT        NOT NULL,
    "user_id"      TEXT        NOT NULL,
    "key_hash"     TEXT        NOT NULL,
    "key_prefix"   TEXT,
    "name"         TEXT        NOT NULL,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at"   TIMESTAMPTZ,
    "last_used_at" TIMESTAMPTZ,

    CONSTRAINT "ApiKey_pkey"         PRIMARY KEY ("id"),
    CONSTRAINT "ApiKey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApiKey_key_hash_key" ON "ApiKey" ("key_hash");
CREATE INDEX "ApiKey_user_id_idx"        ON "ApiKey" ("user_id");
CREATE INDEX "ApiKey_key_hash_idx"       ON "ApiKey" ("key_hash");
CREATE INDEX "ApiKey_expires_at_idx"     ON "ApiKey" ("expires_at");

-- TeamMember
CREATE TABLE "TeamMember" (
    "id"        TEXT             NOT NULL,
    "team_id"   TEXT             NOT NULL,
    "user_id"   TEXT             NOT NULL,
    "role"      "TeamMemberRole" NOT NULL DEFAULT 'DEVELOPER',
    "joined_at" TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT "TeamMember_pkey"                PRIMARY KEY ("id"),
    CONSTRAINT "TeamMember_team_id_user_id_key" UNIQUE ("team_id", "user_id"),
    CONSTRAINT "TeamMember_team_id_fkey"        FOREIGN KEY ("team_id") REFERENCES "Team"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMember_user_id_fkey"        FOREIGN KEY ("user_id") REFERENCES "User"("id")  ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TeamMember_team_id_idx" ON "TeamMember" ("team_id");
CREATE INDEX "TeamMember_user_id_idx" ON "TeamMember" ("user_id");

-- Instance → Team FK (added after Team exists)
ALTER TABLE "Instance"
    ADD CONSTRAINT "Instance_team_id_fkey"
        FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Session (Better Auth)
CREATE TABLE "Session" (
    "id"         TEXT        NOT NULL,
    "user_id"    TEXT        NOT NULL,
    "token"      TEXT        NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_token_key"     ON "Session"("token");
CREATE INDEX "Session_user_id_idx"         ON "Session"("user_id");
CREATE INDEX "Session_token_idx"           ON "Session"("token");
CREATE INDEX "Session_expires_at_idx"      ON "Session"("expires_at");

ALTER TABLE "Session" ADD CONSTRAINT "Session_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Account (OAuth providers)
CREATE TABLE "Account" (
    "id"                       TEXT        NOT NULL,
    "user_id"                  TEXT        NOT NULL,
    "account_id"               TEXT        NOT NULL,
    "provider_id"              TEXT        NOT NULL,
    "access_token"             TEXT,
    "refresh_token"            TEXT,
    "access_token_expires_at"  TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope"                    TEXT,
    "id_token"                 TEXT,
    "password"                 TEXT,
    "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_provider_id_account_id_key" ON "Account"("provider_id", "account_id");
CREATE INDEX "Account_user_id_idx"                      ON "Account"("user_id");

ALTER TABLE "Account" ADD CONSTRAINT "Account_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Verification (magic links and email verification)
CREATE TABLE "Verification" (
    "id"         TEXT        NOT NULL,
    "identifier" TEXT        NOT NULL,
    "value"      TEXT        NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- AuditLog
CREATE TABLE "AuditLog" (
    "id"          TEXT          NOT NULL,
    "user_id"     TEXT,
    "team_id"     TEXT,
    "action"      "AuditAction" NOT NULL,
    "resource"    TEXT          NOT NULL,
    "resource_id" TEXT,
    "metadata"    JSONB,
    "ip_address"  TEXT,
    "user_agent"  TEXT,
    "timestamp"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT "AuditLog_pkey"         PRIMARY KEY ("id"),
    CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AuditLog_user_id_idx"           ON "AuditLog" ("user_id");
CREATE INDEX "AuditLog_team_id_idx"           ON "AuditLog" ("team_id");
CREATE INDEX "AuditLog_action_idx"            ON "AuditLog" ("action");
CREATE INDEX "AuditLog_resource_idx"          ON "AuditLog" ("resource");
CREATE INDEX "AuditLog_resource_id_idx"       ON "AuditLog" ("resource_id");
CREATE INDEX "AuditLog_timestamp_idx"         ON "AuditLog" ("timestamp");
CREATE INDEX "AuditLog_user_id_timestamp_idx" ON "AuditLog" ("user_id", "timestamp");

-- Heartbeat (composite PK required for TimescaleDB hypertable)
CREATE TABLE "Heartbeat" (
    "id"           TEXT        NOT NULL,
    "instance_id"  TEXT        NOT NULL,
    "timestamp"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "cpu_percent"  DOUBLE PRECISION NOT NULL,
    "memory_used"  BIGINT      NOT NULL,
    "memory_total" BIGINT      NOT NULL,
    "disk_used"    BIGINT      NOT NULL,
    "disk_total"   BIGINT      NOT NULL,
    "uptime"       BIGINT      NOT NULL,

    CONSTRAINT "Heartbeat_pkey"           PRIMARY KEY ("id", "timestamp"),
    CONSTRAINT "Heartbeat_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Heartbeat_instance_id_idx"           ON "Heartbeat" ("instance_id");
CREATE INDEX IF NOT EXISTS "Heartbeat_timestamp_idx"             ON "Heartbeat" ("timestamp");
CREATE INDEX IF NOT EXISTS "Heartbeat_instance_id_timestamp_idx" ON "Heartbeat" ("instance_id", "timestamp");

SELECT create_hypertable(
    '"Heartbeat"',
    'timestamp',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE
);

-- Event
CREATE TABLE "Event" (
    "id"          TEXT        NOT NULL,
    "instance_id" TEXT        NOT NULL,
    "event_type"  "EventType" NOT NULL,
    "timestamp"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "metadata"    JSONB,

    CONSTRAINT "Event_pkey"           PRIMARY KEY ("id"),
    CONSTRAINT "Event_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Event_instance_id_idx"           ON "Event" ("instance_id");
CREATE INDEX "Event_event_type_idx"            ON "Event" ("event_type");
CREATE INDEX "Event_timestamp_idx"             ON "Event" ("timestamp");
CREATE INDEX "Event_instance_id_timestamp_idx" ON "Event" ("instance_id", "timestamp");

-- TerminalSession
CREATE TABLE "TerminalSession" (
    "id"          TEXT                   NOT NULL,
    "instance_id" TEXT                   NOT NULL,
    "user_id"     TEXT                   NOT NULL,
    "started_at"  TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    "ended_at"    TIMESTAMPTZ,
    "status"      "TerminalSessionStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "TerminalSession_pkey"              PRIMARY KEY ("id"),
    CONSTRAINT "TerminalSession_instance_id_fkey"  FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TerminalSession_user_id_fkey"      FOREIGN KEY ("user_id")     REFERENCES "User"("id")     ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TerminalSession_instance_id_idx"         ON "TerminalSession" ("instance_id");
CREATE INDEX "TerminalSession_user_id_idx"             ON "TerminalSession" ("user_id");
CREATE INDEX "TerminalSession_status_idx"              ON "TerminalSession" ("status");
CREATE INDEX "TerminalSession_started_at_idx"          ON "TerminalSession" ("started_at");
CREATE INDEX "TerminalSession_instance_id_user_id_idx" ON "TerminalSession" ("instance_id", "user_id");

-- Metric (composite PK required for TimescaleDB hypertable)
CREATE TABLE "Metric" (
    "id"               TEXT             NOT NULL,
    "instance_id"      TEXT             NOT NULL,
    "timestamp"        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    "cpu_percent"      DOUBLE PRECISION NOT NULL,
    "load_avg_1"       DOUBLE PRECISION,
    "load_avg_5"       DOUBLE PRECISION,
    "load_avg_15"      DOUBLE PRECISION,
    "cpu_steal"        DOUBLE PRECISION,
    "core_count"       INT,
    "mem_used"         BIGINT           NOT NULL,
    "mem_total"        BIGINT           NOT NULL,
    "mem_cached"       BIGINT,
    "swap_used"        BIGINT,
    "swap_total"       BIGINT,
    "disk_used"        BIGINT           NOT NULL,
    "disk_total"       BIGINT           NOT NULL,
    "disk_read_bps"    BIGINT,
    "disk_write_bps"   BIGINT,
    "net_bytes_sent"   BIGINT,
    "net_bytes_recv"   BIGINT,
    "net_packets_sent" BIGINT,
    "net_packets_recv" BIGINT,

    CONSTRAINT "Metric_pkey"             PRIMARY KEY ("id", "timestamp"),
    CONSTRAINT "Metric_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE
);

SELECT create_hypertable(
    '"Metric"',
    'timestamp',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE
);

CREATE INDEX IF NOT EXISTS "Metric_instance_id_timestamp_idx" ON "Metric" ("instance_id", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "Metric_timestamp_idx"             ON "Metric" ("timestamp" DESC);

-- Continuous aggregate: hourly rollup
CREATE MATERIALIZED VIEW IF NOT EXISTS "MetricHourly"
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "timestamp") AS "bucket",
    "instance_id",
    AVG("cpu_percent")                 AS "avg_cpu_percent",
    MAX("cpu_percent")                 AS "max_cpu_percent",
    AVG("mem_used")                    AS "avg_mem_used",
    MAX("mem_used")                    AS "max_mem_used",
    AVG("disk_used")                   AS "avg_disk_used",
    MAX("disk_used")                   AS "max_disk_used",
    AVG("load_avg_1")                  AS "avg_load_avg_1",
    SUM("net_bytes_sent")              AS "sum_net_bytes_sent",
    SUM("net_bytes_recv")              AS "sum_net_bytes_recv",
    COUNT(*)                           AS "sample_count"
FROM "Metric"
GROUP BY "bucket", "instance_id"
WITH NO DATA;

-- Continuous aggregate: daily rollup
CREATE MATERIALIZED VIEW IF NOT EXISTS "MetricDaily"
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', "timestamp")  AS "bucket",
    "instance_id",
    AVG("cpu_percent")                 AS "avg_cpu_percent",
    MAX("cpu_percent")                 AS "max_cpu_percent",
    AVG("mem_used")                    AS "avg_mem_used",
    MAX("mem_used")                    AS "max_mem_used",
    AVG("disk_used")                   AS "avg_disk_used",
    MAX("disk_used")                   AS "max_disk_used",
    AVG("load_avg_1")                  AS "avg_load_avg_1",
    SUM("net_bytes_sent")              AS "sum_net_bytes_sent",
    SUM("net_bytes_recv")              AS "sum_net_bytes_recv",
    COUNT(*)                           AS "sample_count"
FROM "Metric"
GROUP BY "bucket", "instance_id"
WITH NO DATA;

SELECT add_continuous_aggregate_policy('"MetricHourly"',
    start_offset      => INTERVAL '3 hours',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists     => TRUE);

SELECT add_continuous_aggregate_policy('"MetricDaily"',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists     => TRUE);

SELECT add_retention_policy('"Metric"',       INTERVAL '7 days',  if_not_exists => TRUE);
SELECT add_retention_policy('"Heartbeat"',    INTERVAL '7 days',  if_not_exists => TRUE);
SELECT add_retention_policy('"MetricHourly"', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('"MetricDaily"',  INTERVAL '1 year',  if_not_exists => TRUE);

ALTER TABLE "Metric" SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'instance_id',
    timescaledb.compress_orderby   = 'timestamp DESC'
);

SELECT add_compression_policy('"Metric"', INTERVAL '2 days', if_not_exists => TRUE);

-- Log
CREATE TABLE "Log" (
    "id"            TEXT        NOT NULL,
    "instance_id"   TEXT        NOT NULL,
    "level"         "LogLevel"  NOT NULL,
    "source"        "LogSource" NOT NULL,
    "message"       TEXT        NOT NULL,
    "metadata"      JSONB,
    "deployment_id" TEXT,
    "timestamp"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "Log_pkey"             PRIMARY KEY ("id"),
    CONSTRAINT "Log_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Log_instance_id_idx"           ON "Log" ("instance_id");
CREATE INDEX "Log_level_idx"                 ON "Log" ("level");
CREATE INDEX "Log_source_idx"                ON "Log" ("source");
CREATE INDEX "Log_timestamp_idx"             ON "Log" ("timestamp");
CREATE INDEX "Log_deployment_id_idx"         ON "Log" ("deployment_id");
CREATE INDEX "Log_instance_id_timestamp_idx" ON "Log" ("instance_id", "timestamp");
CREATE INDEX "Log_instance_id_level_idx"     ON "Log" ("instance_id", "level");
CREATE INDEX "Log_message_fts_idx"           ON "Log" USING GIN (to_tsvector('english', "message"));

-- DeploymentTemplate
CREATE TABLE "DeploymentTemplate" (
    "id"                       TEXT        NOT NULL,
    "name"                     TEXT        NOT NULL,
    "slug"                     TEXT        NOT NULL,
    "category"                 TEXT        NOT NULL,
    "description"              TEXT        NOT NULL,
    "yaml_content"             TEXT        NOT NULL,
    "extensions"               TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    "provider_recommendations" TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_official"              BOOLEAN     NOT NULL DEFAULT FALSE,
    "created_by"               TEXT,
    "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "DeploymentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeploymentTemplate_slug_key"        ON "DeploymentTemplate" ("slug");
CREATE INDEX       "DeploymentTemplate_category_idx"    ON "DeploymentTemplate" ("category");
CREATE INDEX       "DeploymentTemplate_is_official_idx" ON "DeploymentTemplate" ("is_official");
CREATE INDEX       "DeploymentTemplate_created_at_idx"  ON "DeploymentTemplate" ("created_at");

-- Deployment
CREATE TABLE "Deployment" (
    "id"           TEXT               NOT NULL,
    "instance_id"  TEXT,
    "template_id"  TEXT,
    "config_hash"  TEXT               NOT NULL,
    "yaml_content" TEXT               NOT NULL,
    "provider"     TEXT               NOT NULL,
    "region"       TEXT,
    "status"       "DeploymentStatus" NOT NULL DEFAULT 'PENDING',
    "initiated_by" TEXT,
    "started_at"   TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    "completed_at" TIMESTAMPTZ,
    "logs"         TEXT,
    "error"        TEXT,

    CONSTRAINT "Deployment_pkey"             PRIMARY KEY ("id"),
    CONSTRAINT "Deployment_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id")          ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deployment_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "DeploymentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Deployment_instance_id_idx"  ON "Deployment" ("instance_id");
CREATE INDEX "Deployment_template_id_idx"  ON "Deployment" ("template_id");
CREATE INDEX "Deployment_status_idx"       ON "Deployment" ("status");
CREATE INDEX "Deployment_started_at_idx"   ON "Deployment" ("started_at");
CREATE INDEX "Deployment_initiated_by_idx" ON "Deployment" ("initiated_by");

-- ScheduledTask
CREATE TABLE "ScheduledTask" (
    "id"                TEXT                 NOT NULL,
    "name"              TEXT                 NOT NULL,
    "description"       TEXT,
    "cron"              TEXT                 NOT NULL,
    "timezone"          TEXT                 NOT NULL DEFAULT 'UTC',
    "command"           TEXT                 NOT NULL,
    "instance_id"       TEXT,
    "status"            "ScheduledTaskStatus" NOT NULL DEFAULT 'ACTIVE',
    "template"          TEXT,
    "timeout_sec"       INTEGER              NOT NULL DEFAULT 300,
    "max_retries"       INTEGER              NOT NULL DEFAULT 0,
    "notify_on_failure" BOOLEAN              NOT NULL DEFAULT FALSE,
    "notify_on_success" BOOLEAN              NOT NULL DEFAULT FALSE,
    "notify_emails"     TEXT[]               NOT NULL DEFAULT ARRAY[]::TEXT[],
    "last_run_at"       TIMESTAMPTZ,
    "next_run_at"       TIMESTAMPTZ,
    "created_at"        TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    "created_by"        TEXT,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledTask_status_idx"      ON "ScheduledTask" ("status");
CREATE INDEX "ScheduledTask_instance_id_idx" ON "ScheduledTask" ("instance_id");
CREATE INDEX "ScheduledTask_next_run_at_idx" ON "ScheduledTask" ("next_run_at");
CREATE INDEX "ScheduledTask_created_at_idx"  ON "ScheduledTask" ("created_at");
-- Partial index for scheduler polling: only ACTIVE tasks with a due next_run_at
CREATE INDEX "ScheduledTask_due_idx"         ON "ScheduledTask" ("next_run_at")
    WHERE status = 'ACTIVE' AND next_run_at IS NOT NULL;

-- TaskExecution
CREATE TABLE "TaskExecution" (
    "id"           TEXT                 NOT NULL,
    "task_id"      TEXT                 NOT NULL,
    "instance_id"  TEXT,
    "status"       "TaskExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "exit_code"    INTEGER,
    "stdout"       TEXT,
    "stderr"       TEXT,
    "started_at"   TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    "finished_at"  TIMESTAMPTZ,
    "duration_ms"  INTEGER,
    "triggered_by" TEXT,

    CONSTRAINT "TaskExecution_pkey"        PRIMARY KEY ("id"),
    CONSTRAINT "TaskExecution_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ScheduledTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TaskExecution_task_id_idx"            ON "TaskExecution" ("task_id");
CREATE INDEX "TaskExecution_status_idx"             ON "TaskExecution" ("status");
CREATE INDEX "TaskExecution_started_at_idx"         ON "TaskExecution" ("started_at");
CREATE INDEX "TaskExecution_task_id_started_at_idx" ON "TaskExecution" ("task_id", "started_at");

-- CommandExecution
CREATE TABLE "CommandExecution" (
    "id"             TEXT        NOT NULL,
    "instance_id"    TEXT        NOT NULL,
    "user_id"        TEXT        NOT NULL,
    "command"        TEXT        NOT NULL,
    "args"           TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    "env"            JSONB       NOT NULL DEFAULT '{}',
    "working_dir"    TEXT,
    "timeout_ms"     INTEGER     NOT NULL DEFAULT 30000,
    "status"         TEXT        NOT NULL DEFAULT 'RUNNING',
    "exit_code"      INTEGER,
    "stdout"         TEXT,
    "stderr"         TEXT,
    "duration_ms"    INTEGER,
    "correlation_id" TEXT        NOT NULL,
    "script_content" TEXT,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "completed_at"   TIMESTAMPTZ,

    CONSTRAINT "CommandExecution_pkey"             PRIMARY KEY ("id"),
    CONSTRAINT "CommandExecution_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommandExecution_user_id_fkey"     FOREIGN KEY ("user_id")     REFERENCES "User"("id")     ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CommandExecution_correlation_id_key"         ON "CommandExecution" ("correlation_id");
CREATE INDEX "CommandExecution_instance_id_idx"                   ON "CommandExecution" ("instance_id");
CREATE INDEX "CommandExecution_user_id_idx"                       ON "CommandExecution" ("user_id");
CREATE INDEX "CommandExecution_status_idx"                        ON "CommandExecution" ("status");
CREATE INDEX "CommandExecution_created_at_idx"                    ON "CommandExecution" ("created_at");
CREATE INDEX "CommandExecution_instance_id_created_at_idx"        ON "CommandExecution" ("instance_id", "created_at");
CREATE INDEX "CommandExecution_correlation_id_idx"                ON "CommandExecution" ("correlation_id");

-- AlertRule
CREATE TABLE "AlertRule" (
    "id"           TEXT            NOT NULL,
    "name"         TEXT            NOT NULL,
    "description"  TEXT,
    "type"         "AlertRuleType" NOT NULL,
    "severity"     "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "enabled"      BOOLEAN         NOT NULL DEFAULT TRUE,
    "instance_id"  TEXT,
    "conditions"   JSONB           NOT NULL,
    "cooldown_sec" INTEGER         NOT NULL DEFAULT 300,
    "created_by"   TEXT,
    "created_at"   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AlertRule_type_idx"        ON "AlertRule" ("type");
CREATE INDEX "AlertRule_severity_idx"    ON "AlertRule" ("severity");
CREATE INDEX "AlertRule_enabled_idx"     ON "AlertRule" ("enabled");
CREATE INDEX "AlertRule_instance_id_idx" ON "AlertRule" ("instance_id");

-- Alert
CREATE TABLE "Alert" (
    "id"              TEXT            NOT NULL,
    "rule_id"         TEXT            NOT NULL,
    "instance_id"     TEXT,
    "status"          "AlertStatus"   NOT NULL DEFAULT 'ACTIVE',
    "severity"        "AlertSeverity" NOT NULL,
    "title"           TEXT            NOT NULL,
    "message"         TEXT            NOT NULL,
    "metadata"        JSONB,
    "fired_at"        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "acknowledged_at" TIMESTAMPTZ,
    "acknowledged_by" TEXT,
    "resolved_at"     TIMESTAMPTZ,
    "resolved_by"     TEXT,
    "dedupe_key"      TEXT            NOT NULL,

    CONSTRAINT "Alert_pkey"         PRIMARY KEY ("id"),
    CONSTRAINT "Alert_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "AlertRule"("id") ON DELETE CASCADE
);

CREATE INDEX "Alert_rule_id_idx"     ON "Alert" ("rule_id");
CREATE INDEX "Alert_instance_id_idx" ON "Alert" ("instance_id");
CREATE INDEX "Alert_status_idx"      ON "Alert" ("status");
CREATE INDEX "Alert_severity_idx"    ON "Alert" ("severity");
CREATE INDEX "Alert_fired_at_idx"    ON "Alert" ("fired_at");
CREATE INDEX "Alert_dedupe_key_idx"  ON "Alert" ("dedupe_key");

-- NotificationChannel
CREATE TABLE "NotificationChannel" (
    "id"         TEXT                     NOT NULL,
    "name"       TEXT                     NOT NULL,
    "type"       "NotificationChannelType" NOT NULL,
    "config"     JSONB                    NOT NULL,
    "enabled"    BOOLEAN                  NOT NULL DEFAULT TRUE,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ              NOT NULL DEFAULT NOW(),

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationChannel_type_idx"    ON "NotificationChannel" ("type");
CREATE INDEX "NotificationChannel_enabled_idx" ON "NotificationChannel" ("enabled");

-- AlertRuleChannel (join table)
CREATE TABLE "AlertRuleChannel" (
    "rule_id"    TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,

    CONSTRAINT "AlertRuleChannel_pkey"            PRIMARY KEY ("rule_id", "channel_id"),
    CONSTRAINT "AlertRuleChannel_rule_id_fkey"    FOREIGN KEY ("rule_id")    REFERENCES "AlertRule"("id")           ON DELETE CASCADE,
    CONSTRAINT "AlertRuleChannel_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "NotificationChannel"("id") ON DELETE CASCADE
);

-- AlertNotification
CREATE TABLE "AlertNotification" (
    "id"         TEXT        NOT NULL,
    "alert_id"   TEXT        NOT NULL,
    "channel_id" TEXT        NOT NULL,
    "sent_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "success"    BOOLEAN     NOT NULL DEFAULT TRUE,
    "error"      TEXT,
    "payload"    JSONB,

    CONSTRAINT "AlertNotification_pkey"             PRIMARY KEY ("id"),
    CONSTRAINT "AlertNotification_alert_id_fkey"    FOREIGN KEY ("alert_id")   REFERENCES "Alert"("id")               ON DELETE CASCADE,
    CONSTRAINT "AlertNotification_channel_id_fkey"  FOREIGN KEY ("channel_id") REFERENCES "NotificationChannel"("id") ON DELETE CASCADE
);

CREATE INDEX "AlertNotification_alert_id_idx"   ON "AlertNotification" ("alert_id");
CREATE INDEX "AlertNotification_channel_id_idx" ON "AlertNotification" ("channel_id");
CREATE INDEX "AlertNotification_sent_at_idx"    ON "AlertNotification" ("sent_at");

-- Extension
CREATE TABLE "Extension" (
    "id"             TEXT             NOT NULL,
    "name"           TEXT             NOT NULL,
    "display_name"   TEXT             NOT NULL,
    "description"    TEXT             NOT NULL,
    "category"       TEXT             NOT NULL,
    "version"        TEXT             NOT NULL,
    "author"         TEXT,
    "license"        TEXT,
    "homepage_url"   TEXT,
    "icon_url"       TEXT,
    "tags"           TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
    "dependencies"   TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
    "scope"          "ExtensionScope" NOT NULL DEFAULT 'PUBLIC',
    "is_official"    BOOLEAN          NOT NULL DEFAULT FALSE,
    "is_deprecated"  BOOLEAN          NOT NULL DEFAULT FALSE,
    "download_count" INT              NOT NULL DEFAULT 0,
    "created_at"     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    "published_by"   TEXT,

    CONSTRAINT "Extension_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Extension_name_key"       ON "Extension" ("name");
CREATE INDEX       "Extension_category_idx"    ON "Extension" ("category");
CREATE INDEX       "Extension_scope_idx"       ON "Extension" ("scope");
CREATE INDEX       "Extension_is_official_idx" ON "Extension" ("is_official");
CREATE INDEX       "Extension_created_at_idx"  ON "Extension" ("created_at");

-- ExtensionUsage
CREATE TABLE "ExtensionUsage" (
    "id"                  TEXT        NOT NULL,
    "extension_id"        TEXT        NOT NULL,
    "instance_id"         TEXT        NOT NULL,
    "version"             TEXT        NOT NULL,
    "installed_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "removed_at"          TIMESTAMPTZ,
    "install_duration_ms" INT,
    "failed"              BOOLEAN     NOT NULL DEFAULT FALSE,
    "error"               TEXT,

    CONSTRAINT "ExtensionUsage_pkey"              PRIMARY KEY ("id"),
    CONSTRAINT "ExtensionUsage_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ExtensionUsage_extension_id_idx"          ON "ExtensionUsage" ("extension_id");
CREATE INDEX "ExtensionUsage_instance_id_idx"           ON "ExtensionUsage" ("instance_id");
CREATE INDEX "ExtensionUsage_installed_at_idx"          ON "ExtensionUsage" ("installed_at");
CREATE INDEX "ExtensionUsage_extension_id_instance_idx" ON "ExtensionUsage" ("extension_id", "instance_id");

-- ExtensionPolicy
CREATE TABLE "ExtensionPolicy" (
    "id"             TEXT                   NOT NULL,
    "extension_id"   TEXT                   NOT NULL,
    "instance_id"    TEXT,
    "policy"         "ExtensionUpdatePolicy" NOT NULL DEFAULT 'AUTO_UPDATE',
    "pinned_version" TEXT,
    "created_by"     TEXT,
    "created_at"     TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMPTZ            NOT NULL DEFAULT NOW(),

    CONSTRAINT "ExtensionPolicy_pkey"                         PRIMARY KEY ("id"),
    CONSTRAINT "ExtensionPolicy_extension_id_instance_id_key" UNIQUE ("extension_id", "instance_id"),
    CONSTRAINT "ExtensionPolicy_extension_id_fkey"            FOREIGN KEY ("extension_id") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ExtensionPolicy_extension_id_idx" ON "ExtensionPolicy" ("extension_id");
CREATE INDEX "ExtensionPolicy_instance_id_idx"  ON "ExtensionPolicy" ("instance_id");

-- Vulnerability
CREATE TABLE "Vulnerability" (
    "id"              TEXT                    NOT NULL,
    "instance_id"     TEXT                    NOT NULL,
    "cve_id"          TEXT                    NOT NULL,
    "osv_id"          TEXT,
    "package_name"    TEXT                    NOT NULL,
    "package_version" TEXT                    NOT NULL,
    "ecosystem"       TEXT                    NOT NULL,
    "severity"        "VulnerabilitySeverity" NOT NULL DEFAULT 'UNKNOWN',
    "cvss_score"      DOUBLE PRECISION,
    "title"           TEXT                    NOT NULL,
    "description"     TEXT                    NOT NULL,
    "fix_version"     TEXT,
    "references"      TEXT[]                  NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status"          "VulnerabilityStatus"   NOT NULL DEFAULT 'OPEN',
    "detected_at"     TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    "acknowledged_at" TIMESTAMPTZ,
    "acknowledged_by" TEXT,
    "fixed_at"        TIMESTAMPTZ,

    CONSTRAINT "Vulnerability_pkey"            PRIMARY KEY ("id"),
    CONSTRAINT "Vulnerability_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Vulnerability_instance_id_idx"            ON "Vulnerability" ("instance_id");
CREATE INDEX "Vulnerability_cve_id_idx"                 ON "Vulnerability" ("cve_id");
CREATE INDEX "Vulnerability_severity_idx"               ON "Vulnerability" ("severity");
CREATE INDEX "Vulnerability_status_idx"                 ON "Vulnerability" ("status");
CREATE INDEX "Vulnerability_detected_at_idx"            ON "Vulnerability" ("detected_at");
CREATE INDEX "Vulnerability_instance_id_severity_idx"   ON "Vulnerability" ("instance_id", "severity");
CREATE INDEX "Vulnerability_package_name_ecosystem_idx" ON "Vulnerability" ("package_name", "ecosystem");

-- BomEntry
CREATE TABLE "BomEntry" (
    "id"              TEXT        NOT NULL,
    "instance_id"     TEXT        NOT NULL,
    "package_name"    TEXT        NOT NULL,
    "package_version" TEXT        NOT NULL,
    "ecosystem"       TEXT        NOT NULL,
    "license"         TEXT,
    "metadata"        JSONB,
    "scanned_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "BomEntry_pkey"                                                 PRIMARY KEY ("id"),
    CONSTRAINT "BomEntry_instance_id_package_name_package_version_ecosystem_key"
        UNIQUE ("instance_id", "package_name", "package_version", "ecosystem"),
    CONSTRAINT "BomEntry_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BomEntry_instance_id_idx" ON "BomEntry" ("instance_id");
CREATE INDEX "BomEntry_ecosystem_idx"   ON "BomEntry" ("ecosystem");
CREATE INDEX "BomEntry_scanned_at_idx"  ON "BomEntry" ("scanned_at");

-- SecretRotation
CREATE TABLE "SecretRotation" (
    "id"            TEXT        NOT NULL,
    "instance_id"   TEXT        NOT NULL,
    "secret_name"   TEXT        NOT NULL,
    "secret_type"   TEXT        NOT NULL,
    "last_rotated"  TIMESTAMPTZ,
    "next_rotation" TIMESTAMPTZ,
    "rotation_days" INT         NOT NULL DEFAULT 90,
    "is_overdue"    BOOLEAN     NOT NULL DEFAULT FALSE,
    "metadata"      JSONB,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "SecretRotation_pkey"            PRIMARY KEY ("id"),
    CONSTRAINT "SecretRotation_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SecretRotation_instance_id_idx"  ON "SecretRotation" ("instance_id");
CREATE INDEX "SecretRotation_is_overdue_idx"   ON "SecretRotation" ("is_overdue");
CREATE INDEX "SecretRotation_next_rotation_idx" ON "SecretRotation" ("next_rotation");

-- SshKey
CREATE TABLE "SshKey" (
    "id"           TEXT           NOT NULL,
    "instance_id"  TEXT           NOT NULL,
    "fingerprint"  TEXT           NOT NULL,
    "comment"      TEXT,
    "key_type"     TEXT           NOT NULL,
    "key_bits"     INT,
    "status"       "SshKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_used_at" TIMESTAMPTZ,
    "created_at"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    "expires_at"   TIMESTAMPTZ,

    CONSTRAINT "SshKey_pkey"                        PRIMARY KEY ("id"),
    CONSTRAINT "SshKey_instance_id_fingerprint_key" UNIQUE ("instance_id", "fingerprint"),
    CONSTRAINT "SshKey_instance_id_fkey"            FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SshKey_instance_id_idx" ON "SshKey" ("instance_id");
CREATE INDEX "SshKey_status_idx"      ON "SshKey" ("status");
CREATE INDEX "SshKey_key_type_idx"    ON "SshKey" ("key_type");

-- ConfigSnapshot
CREATE TABLE "ConfigSnapshot" (
    "id"           TEXT          NOT NULL,
    "instance_id"  TEXT          NOT NULL,
    "taken_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "declared"     JSONB         NOT NULL,
    "actual"       JSONB         NOT NULL,
    "config_hash"  TEXT          NOT NULL,
    "drift_status" "DriftStatus" NOT NULL DEFAULT 'UNKNOWN',
    "error"        TEXT,

    CONSTRAINT "ConfigSnapshot_pkey"            PRIMARY KEY ("id"),
    CONSTRAINT "ConfigSnapshot_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ConfigSnapshot_instance_id_idx"          ON "ConfigSnapshot" ("instance_id");
CREATE INDEX "ConfigSnapshot_taken_at_idx"             ON "ConfigSnapshot" ("taken_at");
CREATE INDEX "ConfigSnapshot_drift_status_idx"         ON "ConfigSnapshot" ("drift_status");
CREATE INDEX "ConfigSnapshot_instance_id_taken_at_idx" ON "ConfigSnapshot" ("instance_id", "taken_at");

-- DriftEvent
CREATE TABLE "DriftEvent" (
    "id"           TEXT            NOT NULL,
    "snapshot_id"  TEXT            NOT NULL,
    "instance_id"  TEXT            NOT NULL,
    "detected_at"  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "field_path"   TEXT            NOT NULL,
    "declared_val" TEXT,
    "actual_val"   TEXT,
    "severity"     "DriftSeverity" NOT NULL DEFAULT 'MEDIUM',
    "description"  TEXT            NOT NULL,
    "resolved_at"  TIMESTAMPTZ,
    "resolved_by"  TEXT,

    CONSTRAINT "DriftEvent_pkey"            PRIMARY KEY ("id"),
    CONSTRAINT "DriftEvent_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "ConfigSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DriftEvent_snapshot_id_idx"             ON "DriftEvent" ("snapshot_id");
CREATE INDEX "DriftEvent_instance_id_idx"             ON "DriftEvent" ("instance_id");
CREATE INDEX "DriftEvent_detected_at_idx"             ON "DriftEvent" ("detected_at");
CREATE INDEX "DriftEvent_instance_id_detected_at_idx" ON "DriftEvent" ("instance_id", "detected_at");
CREATE INDEX "DriftEvent_resolved_at_idx"             ON "DriftEvent" ("resolved_at");

-- DriftRemediation
CREATE TABLE "DriftRemediation" (
    "id"             TEXT                NOT NULL,
    "drift_event_id" TEXT                NOT NULL,
    "instance_id"    TEXT                NOT NULL,
    "action"         TEXT                NOT NULL,
    "command"        TEXT,
    "status"         "RemediationStatus" NOT NULL DEFAULT 'PENDING',
    "triggered_by"   TEXT,
    "started_at"     TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    "completed_at"   TIMESTAMPTZ,
    "output"         TEXT,
    "error"          TEXT,

    CONSTRAINT "DriftRemediation_pkey"               PRIMARY KEY ("id"),
    CONSTRAINT "DriftRemediation_drift_event_id_key" UNIQUE ("drift_event_id"),
    CONSTRAINT "DriftRemediation_drift_event_id_fkey" FOREIGN KEY ("drift_event_id") REFERENCES "DriftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DriftRemediation_instance_id_idx" ON "DriftRemediation" ("instance_id");
CREATE INDEX "DriftRemediation_status_idx"       ON "DriftRemediation" ("status");
CREATE INDEX "DriftRemediation_started_at_idx"   ON "DriftRemediation" ("started_at");

-- Secret (console vault)
CREATE TABLE "Secret" (
    "id"              TEXT         NOT NULL,
    "name"            TEXT         NOT NULL,
    "description"     TEXT,
    "type"            "SecretType" NOT NULL DEFAULT 'ENV_VAR',
    "instance_id"     TEXT,
    "encrypted_val"   TEXT         NOT NULL,
    "scope"           TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expires_at"      TIMESTAMPTZ,
    "created_by"      TEXT,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "last_rotated_at" TIMESTAMPTZ,

    CONSTRAINT "Secret_pkey"                 PRIMARY KEY ("id"),
    CONSTRAINT "Secret_name_instance_id_key" UNIQUE ("name", "instance_id")
);

CREATE INDEX "Secret_instance_id_idx" ON "Secret" ("instance_id");
CREATE INDEX "Secret_type_idx"        ON "Secret" ("type");
CREATE INDEX "Secret_expires_at_idx"  ON "Secret" ("expires_at");
CREATE INDEX "Secret_created_at_idx"  ON "Secret" ("created_at");

-- CostEntry
CREATE TABLE "CostEntry" (
    "id"           TEXT             NOT NULL,
    "instance_id"  TEXT             NOT NULL,
    "provider"     TEXT             NOT NULL,
    "period_start" TIMESTAMPTZ      NOT NULL,
    "period_end"   TIMESTAMPTZ      NOT NULL,
    "compute_usd"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storage_usd"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "network_usd"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "llm_usd"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_usd"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency"     TEXT             NOT NULL DEFAULT 'USD',
    "source"       TEXT             NOT NULL DEFAULT 'estimated',
    "metadata"     JSONB,
    "created_at"   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT "CostEntry_pkey"            PRIMARY KEY ("id"),
    CONSTRAINT "CostEntry_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CostEntry_instance_id_idx"              ON "CostEntry" ("instance_id");
CREATE INDEX "CostEntry_period_start_idx"             ON "CostEntry" ("period_start");
CREATE INDEX "CostEntry_instance_id_period_start_idx" ON "CostEntry" ("instance_id", "period_start");
CREATE INDEX "CostEntry_provider_idx"                 ON "CostEntry" ("provider");

-- Budget
CREATE TABLE "Budget" (
    "id"              TEXT             NOT NULL,
    "name"            TEXT             NOT NULL,
    "amount_usd"      DOUBLE PRECISION NOT NULL,
    "period"          "BudgetPeriod"   NOT NULL,
    "instance_id"     TEXT,
    "provider"        TEXT,
    "alert_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "alert_sent"      BOOLEAN          NOT NULL DEFAULT FALSE,
    "created_by"      TEXT,
    "created_at"      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Budget_instance_id_idx" ON "Budget" ("instance_id");
CREATE INDEX "Budget_period_idx"      ON "Budget" ("period");
CREATE INDEX "Budget_created_at_idx"  ON "Budget" ("created_at");

-- RightSizingRecommendation
CREATE TABLE "RightSizingRecommendation" (
    "id"               TEXT             NOT NULL,
    "instance_id"      TEXT             NOT NULL,
    "current_tier"     TEXT             NOT NULL,
    "suggested_tier"   TEXT             NOT NULL,
    "current_usd_mo"   DOUBLE PRECISION NOT NULL,
    "suggested_usd_mo" DOUBLE PRECISION NOT NULL,
    "savings_usd_mo"   DOUBLE PRECISION NOT NULL,
    "avg_cpu_percent"  DOUBLE PRECISION NOT NULL,
    "avg_mem_percent"  DOUBLE PRECISION NOT NULL,
    "confidence"       DOUBLE PRECISION NOT NULL,
    "generated_at"     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    "dismissed"        BOOLEAN          NOT NULL DEFAULT FALSE,

    CONSTRAINT "RightSizingRecommendation_pkey"            PRIMARY KEY ("id"),
    CONSTRAINT "RightSizingRecommendation_instance_id_key" UNIQUE ("instance_id"),
    CONSTRAINT "RightSizingRecommendation_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RightSizingRecommendation_instance_id_idx"    ON "RightSizingRecommendation" ("instance_id");
CREATE INDEX "RightSizingRecommendation_savings_usd_mo_idx" ON "RightSizingRecommendation" ("savings_usd_mo");
CREATE INDEX "RightSizingRecommendation_dismissed_idx"      ON "RightSizingRecommendation" ("dismissed");

-- LlmUsageEntry (per-request LLM API usage tracking)
CREATE TABLE "LlmUsageEntry" (
    "id"                 TEXT             NOT NULL,
    "instance_id"        TEXT             NOT NULL,
    "timestamp"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider"           TEXT             NOT NULL,
    "model"              TEXT             NOT NULL,
    "operation"          TEXT,
    "input_tokens"       INTEGER          NOT NULL DEFAULT 0,
    "output_tokens"      INTEGER          NOT NULL DEFAULT 0,
    "cache_read_tokens"  INTEGER,
    "cache_write_tokens" INTEGER,
    "cost_usd"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source"             TEXT             NOT NULL DEFAULT 'agent',
    "capture_tier"       TEXT,
    "trace_id"           TEXT,
    "metadata"           JSONB,

    CONSTRAINT "LlmUsageEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LlmUsageEntry_instance_id_timestamp_idx" ON "LlmUsageEntry"("instance_id", "timestamp");
CREATE INDEX "LlmUsageEntry_timestamp_idx"             ON "LlmUsageEntry"("timestamp");
CREATE INDEX "LlmUsageEntry_provider_model_idx"        ON "LlmUsageEntry"("provider", "model");

ALTER TABLE "LlmUsageEntry" ADD CONSTRAINT "LlmUsageEntry_instance_id_fkey"
    FOREIGN KEY ("instance_id") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Convert LlmUsageEntry to TimescaleDB hypertable (best-effort; no-op if TimescaleDB is unavailable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    -- Drop the default PK so we can create a composite one
    ALTER TABLE "LlmUsageEntry" DROP CONSTRAINT "LlmUsageEntry_pkey";
    ALTER TABLE "LlmUsageEntry" ADD PRIMARY KEY ("id", "timestamp");
    PERFORM create_hypertable('"LlmUsageEntry"', 'timestamp', migrate_data => true);
  END IF;
END $$;
