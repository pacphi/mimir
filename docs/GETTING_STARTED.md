# Getting Started

## Prerequisites

| Tool                                               | Version | Purpose                            |
| -------------------------------------------------- | ------- | ---------------------------------- |
| [Node.js](https://nodejs.org/)                     | 24+     | Runtime                            |
| [pnpm](https://pnpm.io/)                           | 10+     | Package manager                    |
| [Docker](https://www.docker.com/)                  | 20+     | Infrastructure (PostgreSQL, Redis) |
| [Docker Compose](https://docs.docker.com/compose/) | v2+     | Service orchestration              |

## Environment Variables

| Variable                 | Default                 | Description                                       |
| ------------------------ | ----------------------- | ------------------------------------------------- |
| `POSTGRES_USER`          | `mimir`                 | PostgreSQL user                                   |
| `POSTGRES_PASSWORD`      | —                       | PostgreSQL password (**required**)                |
| `POSTGRES_HOST`          | `localhost`             | PostgreSQL host                                   |
| `POSTGRES_PORT`          | `5432`                  | PostgreSQL port                                   |
| `POSTGRES_DB`            | `mimir`                 | PostgreSQL database name                          |
| `REDIS_HOST`             | `localhost`             | Redis host                                        |
| `REDIS_PORT`             | `6379`                  | Redis port                                        |
| `DATABASE_URL`           | _(auto-constructed)_    | Full PostgreSQL URL (overrides `POSTGRES_*` vars) |
| `REDIS_URL`              | _(auto-constructed)_    | Full Redis URL (overrides `REDIS_*` vars)         |
| `PORT`                   | `3001`                  | API server port                                   |
| `CORS_ORIGIN`            | `http://localhost:5173` | Allowed CORS origin (web app URL)                 |
| `JWT_SECRET`             | —                       | Secret for JWT signing                            |
| `SESSION_SECRET`         | —                       | Session encryption secret                         |
| `SINDRI_CONSOLE_API_KEY` | —                       | Bootstrap API key for agent registration          |
| `SINDRI_CONSOLE_URL`     | `http://localhost:3001` | Console endpoint for Draupnir agents              |
| `SINDRI_BIN_PATH`        | —                       | Absolute path to Sindri CLI binary (optional)     |
| `SINDRI_CLI_TIMEOUT_MS`  | `30000`                 | Timeout for Sindri CLI commands                   |
| `LOG_LEVEL`              | `info`                  | Pino log level (`debug`, `info`, `warn`, `error`) |
| `NODE_ENV`               | `development`           | Environment mode                                  |
| `AUTH_BYPASS`            | —                       | Set to `true` for dev auto-login (dev only)       |
| `BETTER_AUTH_URL`        | `http://localhost:3001` | Base URL for auth callbacks                       |
| `GITHUB_CLIENT_ID`       | —                       | GitHub OAuth client ID (optional)                 |
| `GITHUB_CLIENT_SECRET`   | —                       | GitHub OAuth client secret (optional)             |
| `GOOGLE_CLIENT_ID`       | —                       | Google OAuth client ID (optional)                 |
| `GOOGLE_CLIENT_SECRET`   | —                       | Google OAuth client secret (optional)             |
| `RESEND_API_KEY`         | —                       | Resend API key for magic link emails (optional)   |
| `EMAIL_FROM`             | `noreply@sindri.dev`    | Sender address for magic link emails              |
| `METRICS_RETENTION_DAYS` | `30`                    | Metrics data retention                            |
| `LOGS_RETENTION_DAYS`    | `14`                    | Log data retention                                |
| `EVENTS_RETENTION_DAYS`  | `90`                    | Event data retention                              |
| `AUDIT_RETENTION_DAYS`   | `365`                   | Audit log retention                               |

## Setup

### 1. Clone and install

```bash
git clone https://github.com/pacphi/mimir.git
cd mimir
make install
```

### 2. Start infrastructure

This starts PostgreSQL (TimescaleDB) and Redis via Docker Compose:

```bash
make infra-up
```

Verify they're healthy:

```bash
make infra-status
```

### 3. Run database migrations

```bash
make db-migrate
```

### 4. Seed demo data

```bash
make db-seed
```

### 5. Start development servers

```bash
make dev
```

This starts both the API server (`http://localhost:3001`) and the web app (`http://localhost:5173`) in parallel.

Open [http://localhost:5173](http://localhost:5173) in your browser.

> **Authentication:** For local development, set `AUTH_BYPASS=true` in your `.env` to skip OAuth setup. For setting up GitHub/Google OIDC and magic link email, see the [Maintainer Guide — Authentication Setup](./MAINTAINER.md#authentication-setup).

## Docker Compose (Full Stack)

To run everything in containers (no local Node.js required after building):

```bash
make stack-up
```

This starts all 4 services: PostgreSQL, Redis, API, and Web.

Other stack commands:

```bash
make stack-down      # Stop all services
make stack-logs      # Follow container logs
make stack-status    # Show container status
make stack-rebuild   # Rebuild images from scratch
make stack-nuke      # Destroy all volumes (data loss!)
```

## Running Tests

```bash
make test            # Run all tests
make test-coverage   # Run with coverage report
```

## Useful Commands

```bash
make ci              # Full CI pipeline (format, lint, typecheck, test, build)
make lint            # ESLint
make fmt             # Format with Prettier
make typecheck       # TypeScript type checking
make db-studio       # Open Prisma Studio (database GUI)
make db-reset        # Reset database (destroys all data)
```

See the [Makefile](../Makefile) for the full list of targets.

## Next Steps

- [Architecture](./ARCHITECTURE.md) — system design and tech stack
- [API Reference](./API_REFERENCE.md) — REST endpoint documentation
- [Contributing](./CONTRIBUTING.md) — development workflow and conventions
- [Maintainer Guide](./MAINTAINER.md) — OAuth provider setup, auth bypass, Sindri CLI integration
- [RBAC](./RBAC.md) — role-based access control and permission matrix
