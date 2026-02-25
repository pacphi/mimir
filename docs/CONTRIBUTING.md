# Contributing

## Development Environment

This is a TypeScript monorepo managed with [pnpm](https://pnpm.io/) workspaces and [Turborepo](https://turbo.build/).

```bash
# Install dependencies
make install

# Start infrastructure (PostgreSQL + Redis)
make infra-up

# Run database migrations + seed
make db-migrate && make db-seed

# Start dev servers (API + Web in parallel)
make dev
```

See [Getting Started](./GETTING_STARTED.md) for full setup instructions.

## Monorepo Structure

```
apps/api/       → Hono backend (port 3001)
apps/web/       → React frontend (port 5173)
packages/protocol/  → WebSocket protocol contracts
packages/shared/    → Shared TypeScript types
packages/ui/        → UI component library
```

Turborepo handles build ordering (`turbo.json`). The `build`, `test`, `lint`, and `typecheck` tasks respect `^build` dependencies.

## Pre-commit Hooks

[Husky](https://typicode.github.io/husky/) runs on every commit:

1. **lint-staged** — Prettier format check + ESLint on changed files
2. **typecheck** — Full TypeScript type checking (includes Prisma client generation)

Configuration: `.husky/pre-commit`, `lint-staged` in root `package.json`.

## Code Style

### Prettier

Config: `.prettierrc.json`

- Semicolons, double quotes, 2-space indent, trailing commas
- Print width: 100
- LF line endings

```bash
make fmt         # Format all files
make fmt-check   # Check formatting (CI)
```

### ESLint

Config: `eslint.config.js` (flat config, ESLint 10)

- TypeScript-ESLint rules
- React hooks rules (web app)

```bash
make lint
```

### TypeScript

- Strict mode enabled
- TypeScript 5.9

```bash
make typecheck
```

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]
```

Types:

| Type       | Purpose                      |
| ---------- | ---------------------------- |
| `feat`     | New feature                  |
| `fix`      | Bug fix                      |
| `docs`     | Documentation                |
| `refactor` | Code restructuring           |
| `test`     | Adding/updating tests        |
| `chore`    | Maintenance, tooling         |
| `ci`       | CI/CD changes                |
| `deps`     | Dependency updates           |
| `perf`     | Performance improvement      |
| `style`    | Formatting (no logic change) |

The release workflow uses these prefixes to auto-generate changelogs.

## Adding a New API Route

1. Create a new file in `apps/api/src/routes/`:

```typescript
// apps/api/src/routes/widgets.ts
import { Hono } from "hono";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const app = new Hono();

app.use("/*", authMiddleware);

app.get("/", async (c) => {
  // List widgets
  return c.json({ data: [] });
});

app.post("/", requireRole("OPERATOR"), async (c) => {
  // Create widget (OPERATOR+ only)
  const body = await c.req.json();
  return c.json({ data: body }, 201);
});

export default app;
```

2. Register the route in `apps/api/src/routes/index.ts`:

```typescript
import widgets from "./widgets.js";
app.route("/api/v1/widgets", widgets);
```

3. Add tests in `apps/api/tests/routes/widgets.test.ts`.

## Adding a New Frontend Page

The web app uses [TanStack Router](https://tanstack.com/router) with file-based routing.

1. Create a route file in `apps/web/src/routes/`:

```
apps/web/src/routes/widgets.tsx        → /widgets
apps/web/src/routes/widgets/$id.tsx    → /widgets/:id
apps/web/src/routes/widgets/index.tsx  → /widgets (index)
```

2. The route is auto-registered by the TanStack Router plugin (Vite).

3. Use TanStack Query for data fetching:

```typescript
import { useQuery } from "@tanstack/react-query";

function WidgetsPage() {
  const { data } = useQuery({
    queryKey: ["widgets"],
    queryFn: () => fetch("/api/v1/widgets").then((r) => r.json()),
  });
  // ...
}
```

## Testing

```bash
make test            # Run all tests (647 API + 21 web)
make test-coverage   # With coverage report
```

Tests use [Vitest](https://vitest.dev/) 4.0. API tests mock Prisma and Redis; web tests use jsdom.

### Running specific tests

```bash
# API tests only
cd apps/api && pnpm test

# Specific test file
cd apps/api && pnpm vitest run tests/routes/alerts.test.ts

# Watch mode
cd apps/api && pnpm test:watch
```

## Dead Code Detection

[knip](https://knip.dev/) scans for unused exports, dependencies, and files:

```bash
make deadcode
```

This runs in CI as a non-blocking check (`continue-on-error: true`).

## CI Pipeline

The full CI pipeline (`make ci`) runs:

1. Format check (Prettier)
2. Type check (TypeScript)
3. Lint (ESLint)
4. Tests (Vitest)
5. Build (TypeScript + Vite)

This same pipeline runs on push to `main`, on pull requests, and as a gate in the release workflow.

## See Also

- [Architecture](./ARCHITECTURE.md) — system design
- [API Reference](./API_REFERENCE.md) — endpoint documentation
- [Release Process](./RELEASE.md) — how releases work
