# Architecture

## System Overview

```
                          ┌─────────────────────┐
                          │     Browser          │
                          └──────────┬───────────┘
                                     │ HTTP / WS
                          ┌──────────▼───────────┐
                          │   Mimir Web (React)   │
                          │   nginx :80 / :5173   │
                          └──────────┬───────────┘
                                     │ REST API
                          ┌──────────▼───────────┐
                          │   Mimir API (Hono)    │
                          │       :3001           │
                          ├───────────────────────┤
                          │  Workers:             │
                          │  - Metrics aggregation│
                          │  - Alert evaluation   │
                          │  - Cost calculation   │
                          │  - Drift detection    │
                          │  - Cron scheduler     │
                          └──┬──────┬──────┬─────┘
                             │      │      │
              ┌──────────────▼┐  ┌──▼──┐  ┌▼──────────────────┐
              │ TimescaleDB    │  │Redis│  │  WebSocket Gateway │
              │ (PostgreSQL)   │  │     │  │                    │
              └────────────────┘  └──┬──┘  └────────┬───────────┘
                                     │ pub/sub       │ WS
                                     │              ┌▼──────────────────┐
                                     └──────────────│ Draupnir Agents   │
                                                    │ (per instance)    │
                                                    └───────────────────┘
```

## Monorepo Structure

```
mimir/
├── apps/
│   ├── api/              # Hono backend + Prisma + WebSocket gateway
│   └── web/              # React 19 frontend (Vite + TanStack Router)
├── packages/
│   ├── protocol/         # WebSocket protocol contract (channels, envelopes, types)
│   ├── shared/           # Shared TypeScript types
│   └── ui/               # UI component library
├── docker-compose.yml    # Full stack (postgres, redis, api, web)
├── docker-compose.dev.yml # Dev overlay (debug logging)
├── turbo.json            # Turborepo pipeline config
└── Makefile              # Developer workflow targets
```

## Tech Stack

### API (`apps/api`)

| Layer           | Technology                                                | Version |
| --------------- | --------------------------------------------------------- | ------- |
| Framework       | [Hono](https://hono.dev/)                                 | 4.12    |
| ORM             | [Prisma](https://www.prisma.io/)                          | 7.4     |
| Database        | [TimescaleDB](https://www.timescale.com/) (PostgreSQL 16) | —       |
| Cache / Pub-Sub | [Redis](https://redis.io/) (ioredis)                      | 7       |
| WebSocket       | [ws](https://github.com/websockets/ws)                    | 8.18    |
| Validation      | [Zod](https://zod.dev/)                                   | 4.3     |
| Logging         | [Pino](https://getpino.io/)                               | 10.3    |
| Runtime         | Node.js                                                   | 24+     |

### Web (`apps/web`)

| Layer         | Technology                                                  | Version |
| ------------- | ----------------------------------------------------------- | ------- |
| UI Framework  | [React](https://react.dev/)                                 | 19      |
| Build Tool    | [Vite](https://vite.dev/)                                   | 7.3     |
| Routing       | [TanStack Router](https://tanstack.com/router)              | 1.166   |
| Data Fetching | [TanStack Query](https://tanstack.com/query)                | 5.67    |
| State         | [Zustand](https://zustand-demo.pmnd.rs/)                    | 5.0     |
| Terminal      | [@xterm/xterm](https://xtermjs.org/)                        | 6.0     |
| Charts        | [Recharts](https://recharts.org/)                           | 3.8     |
| Code Editor   | [Monaco Editor](https://microsoft.github.io/monaco-editor/) | 0.55    |
| CSS           | [Tailwind CSS](https://tailwindcss.com/)                    | 4.0     |
| Components    | [Radix UI](https://www.radix-ui.com/)                       | —       |
| Icons         | [Lucide](https://lucide.dev/)                               | 0.577   |

### Build & Tooling

| Tool                                              | Purpose                     |
| ------------------------------------------------- | --------------------------- |
| [pnpm](https://pnpm.io/) 10                       | Package manager (workspace) |
| [Turborepo](https://turbo.build/) 2.8             | Monorepo orchestration      |
| [TypeScript](https://www.typescriptlang.org/) 5.9 | Type system                 |
| [ESLint](https://eslint.org/) 10                  | Linting                     |
| [Prettier](https://prettier.io/) 3.8              | Code formatting             |
| [Vitest](https://vitest.dev/) 4.0                 | Test runner                 |
| [Husky](https://typicode.github.io/husky/) 9      | Git hooks                   |
| [knip](https://knip.dev/) 5.86                    | Dead code detection         |

## Background Workers

The API runs several background worker threads:

| Worker              | Location                                 | Purpose                                                  |
| ------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Metrics Aggregation | `services/metrics/aggregation.worker.ts` | Rolls up raw metrics into time-bucketed aggregates       |
| Alert Evaluation    | `services/alerts/evaluation.worker.ts`   | Evaluates alert rules against current metrics/events     |
| Cost Calculation    | `workers/cost.worker.ts`                 | Computes per-instance cost entries from provider pricing |
| Drift Detection     | `services/drift/detector.worker.ts`      | Compares declared vs actual config, creates drift events |
| Cron Scheduler      | `services/scheduler/cron.service.ts`     | Executes scheduled tasks on their cron schedules         |

## Data Flow

### Metrics & Heartbeats

1. Draupnir agent sends metrics (every 30s) and heartbeats (every 10s) over WebSocket
2. API gateway authenticates via API key, stamps `instanceId`
3. Data written to TimescaleDB hypertables (composite PK: `id` + `timestamp`)
4. Aggregation worker rolls up into time buckets
5. Redis pub/sub broadcasts to subscribed browser sessions
6. Web app renders real-time charts via TanStack Query + Zustand

### Terminal Sessions

1. Browser opens terminal → sends `terminal:create` over WebSocket
2. API forwards to target instance's Draupnir agent
3. Agent spawns PTY, streams base64-encoded data bidirectionally
4. Browser renders via xterm.js

### Commands

1. User dispatches command via REST API (`POST /api/v1/commands`)
2. API sends `command:exec` to target instance over WebSocket
3. Agent executes, returns `command:result` with stdout/stderr/exit code
4. Result stored in `CommandExecution` table

### Version Tracking

1. Console API resolves its local Sindri CLI version via `sindri version --json`
2. `GET /api/v1/version` exposes this + computed `min_instance_version` (major.minor.0)
3. Draupnir agents report `sindri_version` and `cli_target` in heartbeat payloads
4. Gateway stores these on the Instance model
5. Frontend compares instance version against min_instance_version for compatibility badges

See [Versioning](./VERSIONING.md) for the complete version management guide.

## RBAC Model

Four roles with hierarchical permissions:

| Role        | Level | Capabilities                                           |
| ----------- | ----- | ------------------------------------------------------ |
| `VIEWER`    | 0     | Read-only access to all dashboards and data            |
| `DEVELOPER` | 1     | + Execute commands, open terminal sessions             |
| `OPERATOR`  | 2     | + Manage instances, alerts, deployments, budgets       |
| `ADMIN`     | 3     | + User/team management, delete resources, view secrets |

Roles are scoped per team via `TeamMember.role`. The `requireRole(minimumRole)` middleware enforces minimum role requirements on API endpoints.

## See Also

- [API Reference](./API_REFERENCE.md) — all REST endpoints
- [WebSocket Protocol](./WEBSOCKET_PROTOCOL.md) — real-time communication
- [Database Schema](./DATABASE_SCHEMA.md) — data model
- [Versioning](./VERSIONING.md) — Sindri CLI version tracking and compatibility
