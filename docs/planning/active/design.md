# Mimir: Fleet Management Control Plane

## Design Document — February 2026

---

## 1. What Mimir Is

**Mimir** is the TypeScript/React web application that serves as the orchestration, administration, and observability layer for [Sindri](https://github.com/pacphi/sindri) environments. It acts as a unified control plane for all deployed Sindri instances across every provider.

It originated as the `v3/console/` component of the Sindri monorepo and was established as an independent project to own its release lifecycle, deployment model, and feature evolution separately from the CLI tool.

### The Problem It Solves

Sindri (the CLI) is entirely instance-driven. Each instance is an island — deployed independently, managed independently, with no visibility across a fleet. Mimir closes that gap:

| Without Mimir                             | With Mimir                                                   |
| ----------------------------------------- | ------------------------------------------------------------ |
| No central registry of deployed instances | Web dashboard showing all instances across all providers     |
| No real-time health visibility            | Live CPU, memory, disk, and network metrics per instance     |
| Terminal access requires SSH setup        | Web-based terminal, no local tooling needed                  |
| No audit trail                            | Every action logged with user, timestamp, target             |
| No fleet-wide operations                  | Parallel command dispatch, bulk lifecycle ops                |
| No cost visibility                        | Per-instance cost tracking with right-sizing recommendations |

---

## 2. Architecture

```
Browser ──► Mimir Web (React 19)  ──► Mimir API (Hono)  ──► TimescaleDB + Redis
                                          ▲
                                          │ WebSocket (protocol v1.0)
                                          │
                               Draupnir Agent (per instance)
                                          │
                                 sindri-managed instance
```

### Technology Stack

#### Frontend (`apps/web`)

| Library           | Purpose                           |
| ----------------- | --------------------------------- |
| React 19 + Vite   | Core framework                    |
| TanStack Router   | Type-safe routing, nested layouts |
| TanStack Query    | Server state, real-time refetch   |
| Zustand           | Client state (terminal, UI)       |
| shadcn/ui + Radix | Accessible component primitives   |
| Tailwind CSS 4    | Styling                           |
| xterm.js          | Web terminal (PTY streaming)      |
| Monaco Editor     | YAML/config editor with diff view |
| Recharts          | Charts and metrics dashboards     |

#### Backend (`apps/api`)

| Library                  | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| Hono                     | HTTP framework                              |
| Prisma                   | ORM — type-safe database access             |
| TimescaleDB (PostgreSQL) | Time-series metric storage with hypertables |
| Redis                    | Pub/sub for live metric streaming           |
| WebSocket (ws)           | Real-time terminal, heartbeat, metrics      |
| Pino                     | Structured logging                          |

#### Shared (`packages/`)

| Package           | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `@mimir/protocol` | WebSocket envelope and payload type definitions (TypeScript) |
| `@mimir/shared`   | Instance, heartbeat, deployment shared types                 |
| `@mimir/ui`       | Shared UI component library                                  |

---

## 3. Auto-Registration Flow

Each Sindri instance with the [draupnir](https://github.com/pacphi/draupnir) extension installed will, on boot:

1. **POST registration** to the Mimir API with: instance ID, provider, region, agent version, OS, arch, tags
2. **Begin heartbeat** — periodic pings (default 30s) with CPU, memory, disk, uptime
3. **Send metrics** — full system resource snapshot (default 60s)
4. **Stream events** — deploy, connect, disconnect, backup, destroy
5. **Accept terminal sessions** — PTY allocation on demand

The Mimir endpoint URL is configured via environment variables on the instance:

```bash
SINDRI_CONSOLE_URL=https://mimir.example.com
SINDRI_CONSOLE_API_KEY=<api-key>
SINDRI_AGENT_HEARTBEAT=30
SINDRI_AGENT_METRICS=60
```

---

## 4. Orchestration Capabilities

### Instance Lifecycle Management

From the Mimir web UI, operators can:

- **Deploy new environments** — select a template or paste `sindri.yaml`, choose provider + region, and kick off deployment via the Sindri CLI integration
- **Clone environments** — duplicate an existing instance's configuration to a new provider/region
- **Redeploy / update** — push config changes, trigger extension updates
- **Suspend / resume** — pause instances to save cost (especially on Fly.io)
- **Destroy** — clean teardown with optional volume backup

### Deployment Wizard (Step 1 Redesign — February 2026)

Step 1 was redesigned to align with the Sindri V3 CLI workflow:

| Before                                | After                                                             |
| ------------------------------------- | ----------------------------------------------------------------- |
| Hardcoded persona templates           | Provider selector driving `config init`-style YAML generation     |
| Template-driven YAML population       | Extensions multi-select from live registry (`/api/v1/extensions`) |
| No extension browsing in wizard       | Profile shortcuts from `/api/v1/profiles` endpoint                |
| Provider selection deferred to Step 2 | Provider selection on Step 1; Step 2 shows region only            |

### Command Dispatch

- **One-off commands** — execute with stdout/stderr streaming
- **Script upload and execution** across one or multiple instances
- **Scheduled tasks** — cron-like scheduling for maintenance operations
- **Parallel execution** — fan out commands across selected instances

### Web Terminal

Users can spawn interactive shells in the browser connected to any running instance. No SSH setup or local tooling required. Powered by xterm.js on the frontend and PTY allocation in [draupnir](https://github.com/pacphi/draupnir) on the instance.

---

## 5. Administration Capabilities

### User & Access Management

- **RBAC** — Admin, Operator, Developer, Viewer roles
- **Team workspaces** — group instances by team/project
- **API key management** — generate/revoke keys for CI/CD integration
- **Audit log** — every action logged with user, timestamp, IP, action, target

### Configuration Management

- **Template library** — curated `sindri.yaml` templates for common stacks
- **Configuration diff** — compare configs across instances
- **Drift detection** — flag instances whose running state diverges from declared config
- **Secrets vault** — centralized secrets management with per-instance injection

### Extension Administration

- **Extension registry** — browse and audit all extensions (backed by `sindri extension list --json`)
- **Usage matrix** — which instances use which extensions
- **Custom extension hosting** — upload private extensions for your org
- **Update policies** — auto-update, pin, or freeze extension versions
- **Dependency graph** — visualize extension dependency chains

### Cost Management

- **Per-instance cost tracking** — compute, storage, network by provider
- **Budget alerts** — set thresholds per team/project
- **Right-sizing recommendations** — instances consistently under-utilizing compute
- **Idle instance detection** — flag environments with no activity for N days

---

## 6. Observability Capabilities

### Real-Time Architecture

```
Draupnir Agent                    Mimir Backend                Frontend
──────────────                    ─────────────                ────────
gopsutil ──► collect ──► WebSocket ──► Redis Pub/Sub ──► TanStack Query
             (30s)        ingest         (real-time)      subscription
                            │                                   │
                            ▼                                   ▼
                       TimescaleDB                          Recharts
                       (hypertables)                    (live gauges/graphs)
```

### WebSocket Channels

The Mimir API maintains persistent WebSocket connections to each connected draupnir agent:

```
Mimir ◄──── ws:// ────► Draupnir Agent
  │
  ├── channel: metrics     (instance → mimir, every 60s)
  ├── channel: heartbeat   (instance → mimir, every 30s)
  ├── channel: logs        (instance → mimir, streaming)
  ├── channel: terminal    (bidirectional, per-session)
  ├── channel: events      (instance → mimir, on occurrence)
  └── channel: commands    (mimir → instance, on demand)
```

All messages use the shared envelope format from `@mimir/protocol` (protocol version `1.0`).

### Metrics Captured

**Instance-Level (from draupnir agent)**

| Category | Metrics                                   |
| -------- | ----------------------------------------- |
| CPU      | Usage %, load average, process count      |
| Memory   | Used/available/cached, swap usage         |
| Disk     | Volume usage, inode usage, I/O throughput |
| Network  | Bytes in/out, active connections          |

**Fleet-Level (aggregated by Mimir)**

| Category   | Metrics                                                       |
| ---------- | ------------------------------------------------------------- |
| Capacity   | Total instances by provider/region, active vs idle ratio      |
| Cost       | Spend by provider, spend by team                              |
| Compliance | Extension version distribution, config drift count            |
| Trends     | Environment creation rate, average lifespan, peak concurrency |

### Dashboards

- **Fleet Overview** — world map of instance locations, health summary, provider distribution, active sessions, 24h deployment activity timeline
- **Instance Detail** — real-time CPU/memory/disk gauges, process tree, network graph, extension health, recent events timeline
- **Security** — BOM vulnerability summary, extension version freshness, secret age, SSH key audit, network exposure map

### Alerting

- **Threshold alerts** — CPU > 90% for 5m, disk > 85%, memory pressure
- **Lifecycle alerts** — instance unresponsive, heartbeat lost, deploy failed
- **Security alerts** — new CVE in installed package, expired secret
- **Cost alerts** — budget threshold reached, idle instance

Delivered via webhook, Slack, email, or PagerDuty.

---

## 7. CLI Integration

Mimir treats the Sindri CLI as a runtime dependency for registry queries. Instead of maintaining stale TypeScript constants, the API shells out to the `sindri` binary and returns live JSON output.

### Registry Endpoints

| Endpoint                                     | CLI command backed                   |
| -------------------------------------------- | ------------------------------------ |
| `GET /api/v1/registry/extensions`            | `sindri extension list --all --json` |
| `GET /api/v1/registry/extensions/categories` | derived from extension list          |
| `GET /api/v1/registry/profiles`              | `sindri profile list --json`         |
| `GET /api/v1/registry/version`               | `sindri version --json`              |

### Binary Delivery Modes

- **Dev**: volume-mount `../../target/release/sindri` via docker-compose override
- **Production**: download pinned release binary at Docker build time (`ARG SINDRI_VERSION`) or install `@sindri/cli` npm package

Fallback chain: `SINDRI_BIN_PATH` env → `./node_modules/.bin/sindri` → `sindri` on PATH → graceful `{ error: "CLI_UNAVAILABLE", fallback: true }`.

### Instance Version Awareness

Draupnir agents report `sindri_version` and `cli_target` in heartbeat payloads. Mimir stores this on the `Instance` model and surfaces compatibility badges:

- Green: same minor version as console CLI
- Yellow: older patch/minor (minor feature gaps possible)
- Red: major version mismatch (API calls may fail)

`GET /api/v1/version` exposes:

```json
{
  "console_api": "0.1.0",
  "sindri_cli": "3.0.1",
  "cli_target": "aarch64-apple-darwin",
  "min_instance_version": "3.0.0"
}
```

---

## 8. Project Structure

```
mimir/
├── apps/
│   ├── api/                     # Node.js/TypeScript backend (Hono + Prisma)
│   │   ├── prisma/              # Database schema (50+ models) and migrations
│   │   ├── src/
│   │   │   ├── routes/          # 23 route files (instances, fleet, metrics, alerts, ...)
│   │   │   ├── services/        # Business logic (metrics, alerting, costs, drift, ...)
│   │   │   ├── websocket/       # WebSocket server (auth, channels, handlers, Redis)
│   │   │   ├── agents/          # gateway.ts — agent state management
│   │   │   ├── workers/         # Background jobs (cost aggregation)
│   │   │   └── lib/             # db, redis, logger, cli integration
│   │   └── Dockerfile
│   └── web/                     # React 19 frontend (Vite + TanStack Router)
│       ├── src/
│       │   ├── components/      # 19 component directories
│       │   ├── routes/          # 16 route files (dashboard, instances, terminal, ...)
│       │   ├── hooks/           # 16 custom hooks
│       │   ├── api/             # API client layer
│       │   ├── stores/          # Zustand state (terminal, UI, theme)
│       │   └── types/           # Local type definitions
│       └── Dockerfile
├── packages/
│   ├── protocol/                # WebSocket protocol contract (shared with draupnir)
│   ├── shared/                  # Shared TypeScript types (Instance, Heartbeat, ...)
│   └── ui/                      # Shared UI component library
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API_SPEC.md
│   ├── DATABASE_SCHEMA.md
│   ├── SETUP.md
│   └── planning/active/         # This document
├── docker-compose.yml           # TimescaleDB + Redis + api + web
├── docker-compose.dev.yml       # Dev overlay
├── turbo.json                   # Turborepo pipeline
└── Makefile                     # Full development workflow
```

---

## 9. Implementation Status (as of February 2026)

All four phases of the original roadmap are **complete**.

| Phase              | Scope                                                                                                                 | Status      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1 — Foundation     | Instance registry, API auth, WebSocket gateway, web terminal, React app shell                                         | ✅ Complete |
| 2 — Orchestration  | Deployment wizard, lifecycle ops (suspend/resume/destroy/clone/redeploy), command dispatch, scheduled tasks           | ✅ Complete |
| 3 — Observability  | Metrics pipeline (TimescaleDB hypertables), fleet dashboard, instance detail charts, log aggregation, alerting engine | ✅ Complete |
| 4 — Administration | RBAC, team workspaces, extension registry, drift detection, cost tracking, security/BOM dashboard                     | ✅ Complete |

### Known Docker Compose Issues (Resolved)

The following were discovered and fixed during initial Docker Compose bring-up:

1. **Stale `pnpm-lock.yaml`** after dependency version changes — fix: always run `pnpm install` after `package.json` changes before building Docker images
2. **Duplicate migration 002** — `ScheduledTask`/`TaskExecution` already existed in migration 001; migration 002 replaced with a no-op `SELECT 1;`
3. **Wrong postgres image** — TimescaleDB required; changed to `timescale/timescaledb:latest-pg16`
4. **`Heartbeat` primary key incompatible with hypertable** — primary key changed to `(id, timestamp)` to satisfy TimescaleDB partition constraint
5. **Frontend auth not wired** — dev mode uses nginx proxy injection (`X-Api-Key`) until a real login flow is added

---

## 10. Running Locally

```bash
# Prerequisites: Node.js 24+, pnpm 10+, Docker

make install          # Install all pnpm dependencies
make infra-up         # Start postgres (TimescaleDB) + redis
make db-migrate       # Run Prisma migrations
make db-seed          # Seed demo data (users, instances, API keys)
make dev              # Start API + Web dev servers

# Or run the full Docker Compose stack:
make stack-up         # All 4 services in Docker
make db-seed          # Seed (first time only per volume)
```

Web UI: http://localhost:5173
API: http://localhost:3001
Health: http://localhost:3001/health

### Seeded Development Credentials

| User      | Email                  | API Key                      | Role      |
| --------- | ---------------------- | ---------------------------- | --------- |
| Admin     | `admin@sindri.dev`     | `sk-admin-dev-seed-key-0001` | ADMIN     |
| Developer | `developer@sindri.dev` | `sk-dev-seed-key-0001`       | DEVELOPER |

---

## 11. Related Projects

| Repository                                     | Role                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [sindri](https://github.com/pacphi/sindri)     | CLI tool — provisions and configures instances; source of extension/profile registry        |
| [draupnir](https://github.com/pacphi/draupnir) | Per-instance agent — connects instances to mimir via WebSocket                              |
| **mimir** (this repo)                          | Fleet management control plane — orchestrates, observes, and administers instances at scale |
