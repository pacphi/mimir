# Maintainer Guide

This guide covers workflows specific to Mimir maintainers — particularly when developing against unreleased Sindri CLI builds or working across both repositories.

## Local Development with Unreleased Sindri

When developing Mimir features that depend on unreleased Sindri CLI changes, you need both repos cloned locally:

```
~/dev/
  mimir/      # this repo
  sindri/     # https://github.com/pacphi/sindri — Rust CLI
```

### Option 1: Native dev mode (recommended)

Run the API natively on your host (not in a container). The Sindri binary runs on your OS directly — no cross-compilation needed.

```bash
# 1. Build Sindri locally (in the sindri repo)
cd ../sindri/v3
cargo build --release
# Binary: ../sindri/v3/target/release/sindri

# 2. Start Mimir infrastructure only (postgres + redis in Docker)
make infra-up

# 3. Run Mimir API + Web natively, pointing at your local Sindri binary
SINDRI_BIN_PATH=../sindri/v3/target/release/sindri make dev-full
```

Or set it in your `.env`:

```bash
SINDRI_BIN_PATH=/absolute/path/to/sindri/v3/target/release/sindri
```

This is the fastest iteration loop — `cargo build` on the Sindri side, then the next Mimir CLI call picks up the new binary automatically (no restart needed).

### Option 2: Docker Compose with volume mount

When you need to test the full containerized stack, volume-mount the Sindri binary into the API container. Create a `docker-compose.override.yml` (git-ignored):

```yaml
# docker-compose.override.yml
services:
  api:
    volumes:
      - ../sindri/v3/target/x86_64-unknown-linux-musl/release/sindri:/usr/local/bin/sindri:ro
    environment:
      SINDRI_BIN_PATH: /usr/local/bin/sindri
```

**Important:** The container runs Alpine Linux, so the binary must be compiled for Linux — not your host OS. Cross-compile in the Sindri repo:

```bash
# For x86_64 containers (most common):
cd ../sindri/v3
cargo build --release --target x86_64-unknown-linux-musl

# For ARM containers (Apple Silicon with default Docker):
cargo build --release --target aarch64-unknown-linux-musl
```

Then start the stack normally:

```bash
make stack-up    # docker-compose.override.yml is auto-merged by Docker Compose
```

### Option 3: Build-arg with Docker image (CI/release style)

For testing the exact production image build path, pass a released (or pre-release) version:

```bash
docker compose build --build-arg SINDRI_VERSION=3.2.5
make stack-up
```

The Dockerfile downloads the tarball from GitHub Releases. This doesn't work for truly unreleased code — use Option 1 or 2 for that.

## Make Targets Reference

### Development (native)

| Target              | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `make dev`          | Start API + Web dev servers (needs infra already running) |
| `make dev-full`     | Start infrastructure, then dev servers                    |
| `make infra-up`     | Start postgres + redis containers only                    |
| `make infra-down`   | Stop infrastructure                                       |
| `make infra-status` | Show infrastructure container status                      |

### Full Stack (Docker Compose)

| Target               | Description                                      |
| -------------------- | ------------------------------------------------ |
| `make stack-up`      | Start all 4 services (postgres, redis, api, web) |
| `make stack-down`    | Stop all services                                |
| `make stack-rebuild` | Rebuild images (no cache) and restart            |
| `make stack-logs`    | Follow all container logs                        |
| `make stack-status`  | Show container status                            |
| `make stack-nuke`    | Stop all services and destroy volumes            |

### Database

| Target                   | Description                        |
| ------------------------ | ---------------------------------- |
| `make db-migrate`        | Run Prisma migrations (dev mode)   |
| `make db-migrate-deploy` | Run migrations (production mode)   |
| `make db-seed`           | Seed demo data                     |
| `make db-reset`          | Reset database (destroys all data) |
| `make db-studio`         | Open Prisma Studio GUI             |

### Quality

| Target           | Description                                         |
| ---------------- | --------------------------------------------------- |
| `make ci`        | Full pipeline: format, lint, typecheck, test, build |
| `make test`      | Run all tests                                       |
| `make lint`      | ESLint                                              |
| `make fmt`       | Format with Prettier                                |
| `make typecheck` | TypeScript type checking                            |
| `make deadcode`  | Scan for unused exports/dependencies (knip)         |

## Sindri CLI Integration Points

The API calls the Sindri CLI binary at runtime for registry queries and version detection. When developing features that touch these paths:

| Code Path                         | Purpose                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `apps/api/src/lib/cli.ts`         | Binary resolution (`getSindriBin()`) and execution (`runCliJson()`) |
| `apps/api/src/routes/version.ts`  | `GET /api/v1/version` — version + `min_instance_version`            |
| `apps/api/src/routes/registry.ts` | `GET /api/v1/registry/*` — extensions, profiles, version            |

The CLI resolution chain: `SINDRI_BIN_PATH` env var → `./node_modules/.bin/sindri` → `sindri` on PATH → error.

See [Versioning](./VERSIONING.md) for the full version management documentation.

## See Also

- [Getting Started](./GETTING_STARTED.md) — initial setup and prerequisites
- [Contributing](./CONTRIBUTING.md) — code style, testing, adding routes
- [Architecture](./ARCHITECTURE.md) — system design and data flow
- [Versioning](./VERSIONING.md) — Sindri CLI version tracking and compatibility
