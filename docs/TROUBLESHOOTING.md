# Troubleshooting

## Database

### TimescaleDB extension not available

**Problem:** Migration fails with `extension "timescaledb" is not available`.

**Cause:** Using standard PostgreSQL instead of TimescaleDB.

**Solution:** Ensure you're using the TimescaleDB Docker image:

```yaml
# docker-compose.yml
postgres:
  image: timescale/timescaledb:latest-pg16
```

If using `make infra-up`, this is already configured.

### Hypertable creation fails

**Problem:** `create_hypertable` fails on Heartbeat or Metric tables.

**Cause:** Tables already have data, or the TimescaleDB extension wasn't created first.

**Solution:** Reset the database and re-run migrations:

```bash
make db-reset
make db-migrate
```

### Prisma 7 adapter error

**Problem:** `PrismaClient` throws "No adapter provided" or similar error.

**Cause:** Prisma 7 requires an explicit database adapter. The `datasource` block no longer has a `url` field.

**Solution:** Ensure `prisma.config.ts` exists at `apps/api/` and the client is initialized with the adapter:

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

### `prisma generate` fails without DATABASE_URL

**Problem:** `prisma generate` requires `DATABASE_URL` but you don't have a running database.

**Cause:** `prisma.config.ts` references the environment variable.

**Solution:** The config handles this gracefully — `prisma generate` works without a live DB. If it still fails, set a dummy URL:

```bash
DATABASE_URL=postgresql://x:x@localhost:5432/x pnpm db:generate
```

## Redis

### Connection refused

**Problem:** API fails to start with Redis connection error.

**Cause:** Redis is not running.

**Solution:**

```bash
make infra-up
make infra-status   # Verify redis is healthy
```

### Redis pub/sub not working

**Problem:** WebSocket clients don't receive real-time updates.

**Cause:** Redis pub/sub requires a separate connection from the main client.

**Solution:** Check that the API can connect to Redis and that `REDIS_URL` is correct. Restart the API:

```bash
# Check Redis
docker exec -it mimir-redis redis-cli ping

# Restart API
make dev
```

## WebSocket

### Connection rejected (401)

**Problem:** WebSocket connection is immediately closed with a 401.

**Cause:** Missing or invalid API key.

**Solution:** Pass the key as a header or query parameter:

```javascript
// Browser
const ws = new WebSocket("ws://localhost:3001/ws?apiKey=YOUR_KEY");

// Agent
// Set X-Api-Key and X-Instance-ID headers
```

### Agent not sending data

**Problem:** Instance shows as connected but no metrics/heartbeats appear.

**Cause:** Agent is connected but not sending envelopes in the correct format.

**Solution:** Verify the agent sends correctly formatted envelopes:

```json
{
  "protocolVersion": "1.0",
  "channel": "heartbeat",
  "type": "heartbeat:ping",
  "ts": 1709000000000,
  "data": {
    "agentVersion": "1.0.0",
    "uptime": 3600
  }
}
```

See [WebSocket Protocol](./WEBSOCKET_PROTOCOL.md) for the full specification.

## Build & CI

### pnpm install fails with engine mismatch

**Problem:** `pnpm install` fails with Node.js or pnpm version error.

**Cause:** Project requires Node.js 24+ and pnpm 10+.

**Solution:**

```bash
node --version    # Must be >= 24.0.0
pnpm --version    # Must be >= 10.0.0

# Use nvm to switch Node versions
nvm install 24
nvm use 24

# pnpm is managed via corepack
corepack enable
corepack prepare pnpm@10.30.0 --activate
```

### Type check fails after dependency update

**Problem:** `pnpm typecheck` fails after adding/updating packages.

**Cause:** Prisma client needs regeneration.

**Solution:**

```bash
make db-generate   # Regenerate Prisma client
make typecheck     # Try again
```

### Build fails in monorepo

**Problem:** Build fails with module resolution errors between packages.

**Cause:** Turborepo dependency ordering issue, or missing `^build` dependency.

**Solution:**

```bash
# Clean and rebuild
make clean
make build
```

### Pre-commit hook fails

**Problem:** `git commit` is rejected by the pre-commit hook.

**Cause:** lint-staged (Prettier/ESLint) or typecheck found issues.

**Solution:** Fix the reported issues, then commit again:

```bash
make fmt          # Auto-fix formatting
make lint         # Check for lint errors
make typecheck    # Check types
```

## Docker

### API container can't reach PostgreSQL

**Problem:** API container fails with "connection refused" to postgres.

**Cause:** Service name mismatch or network issue.

**Solution:** In Docker Compose, services connect by service name:

```
DATABASE_URL=postgresql://mimir:mimir@postgres:5432/mimir
```

Not `localhost` — use the service name `postgres`.

### Web container returns 502

**Problem:** Browser shows 502 Bad Gateway.

**Cause:** Nginx can't reach the API container.

**Solution:** Ensure the API container is healthy:

```bash
make stack-status
make stack-logs
```

### Docker build fails with COPY errors

**Problem:** `COPY` step fails during Docker build.

**Cause:** Missing files or incorrect build context.

**Solution:** Build from the repository root (not from `apps/api/`):

```bash
docker build -f apps/api/Dockerfile .
```

The Dockerfiles expect the repository root as the build context.

## CORS

### CORS error in browser

**Problem:** Browser console shows CORS errors when calling the API.

**Cause:** `CORS_ORIGIN` doesn't match the web app's URL.

**Solution:** Set `CORS_ORIGIN` to match your web app URL:

```bash
# Development
CORS_ORIGIN=http://localhost:5173

# Docker Compose
CORS_ORIGIN=http://localhost:5173
```

## pnpm Workspace

### "Cannot find module" for workspace packages

**Problem:** Import from `@mimir/shared` or `@mimir/protocol` fails.

**Cause:** Package not built or workspace link broken.

**Solution:**

```bash
make install    # Re-link workspace packages
make build      # Build all packages in dependency order
```

### Phantom dependencies

**Problem:** A package uses a dependency it doesn't declare in its own `package.json`.

**Cause:** pnpm's strict isolation prevents hoisting.

**Solution:** Add the dependency explicitly to the package that uses it:

```bash
cd apps/api
pnpm add <package-name>
```
