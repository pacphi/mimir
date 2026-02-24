# Mimir

[![License](https://img.shields.io/github/license/pacphi/mimir)](LICENSE)
[![CI](https://github.com/pacphi/mimir/actions/workflows/ci.yml/badge.svg)](https://github.com/pacphi/mimir/actions/workflows/ci.yml)
[![Release](https://github.com/pacphi/mimir/actions/workflows/release.yml/badge.svg)](https://github.com/pacphi/mimir/actions/workflows/release.yml)

Fleet management control plane for [Sindri](https://github.com/pacphi/sindri) environments.

Mimir provides a web dashboard and REST/WebSocket API for orchestrating, administering, and observing Sindri-managed instances across providers.

## Architecture

```
Browser ──► Mimir Web (React 19) ──► Mimir API (Hono) ──► TimescaleDB + Redis
                                         ▲
                                         │ WebSocket
                                         │
                                    Draupnir Agent (per instance)
```

## Quick Start

```bash
# Prerequisites: Node.js 24+, pnpm 10+, Docker

# Install dependencies
make install

# Start infrastructure (postgres + redis)
make infra-up

# Run database migrations
make db-migrate

# Seed demo data
make db-seed

# Start development servers
make dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Docker Compose (full stack)

```bash
make stack-up
```

## Project Structure

```
mimir/
  apps/
    api/          # Node.js/TypeScript backend (Hono + Prisma + WebSocket)
    web/          # React 19 frontend (Vite + TanStack Router)
  packages/
    shared/       # Shared TypeScript types
    ui/           # UI component library
    protocol/     # WebSocket protocol contract definitions
  docs/           # Architecture, API spec, database schema
```

## CI

```bash
make ci    # format-check, lint, typecheck, test, build
```

## Related Projects

- [sindri](https://github.com/pacphi/sindri) — CLI tool + extension ecosystem
- [draupnir](https://github.com/pacphi/draupnir) — Per-instance agent extension

## License

[MIT](LICENSE)
