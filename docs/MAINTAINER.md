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
SINDRI_BIN_PATH=/absolute/path/to/sindri/v3/target/release/sindri make dev-full
```

Or set it in your `.env`:

```bash
SINDRI_BIN_PATH=/absolute/path/to/sindri/v3/target/release/sindri
```

> **Note:** `SINDRI_BIN_PATH` must be an **absolute path**. Relative paths will not resolve correctly because the API process working directory varies depending on how it is started (e.g. turborepo, make, or direct `pnpm dev`).

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
| `make infra-reset`  | Nuke postgres + redis volumes, restart containers         |

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

## Authentication Setup

Mimir uses [Better Auth](https://www.better-auth.com/) for passwordless authentication with three login methods: GitHub OIDC, Google OIDC, and magic link email. See [ADR-0002](adr/0002-oidc-magic-link-authentication.md) for the design rationale and [RBAC.md](RBAC.md) for the full authorization matrix.

### Local Development (No OAuth Required)

For local development you can skip OAuth provider setup entirely using the auth bypass:

```bash
# In your .env
AUTH_BYPASS=true
```

When `NODE_ENV=development` and `AUTH_BYPASS=true`, all API requests are automatically authenticated as the seed admin user (`admin@sindri.dev`, ADMIN role). The login page still renders, but API calls work without signing in. This is the recommended path for developers who don't need to test the auth flow itself.

### Setting Up OAuth Providers (Production / Auth Testing)

#### GitHub OAuth App

1. Go to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** `Mimir (dev)` (or your environment name)
   - **Homepage URL:** `http://localhost:5173`
   - **Authorization callback URL:** `http://localhost:3001/api/auth/callback/github`
4. Click **Register application**
5. Copy the **Client ID**
6. Generate a **Client Secret** and copy it immediately

Add to your `.env`:

```bash
GITHUB_CLIENT_ID=Iv1.abc123...
GITHUB_CLIENT_SECRET=abc123secret...
```

> **Production note:** For deployed environments, replace `localhost` URLs with your actual domain. GitHub allows only one callback URL per OAuth app, so create separate apps for dev, staging, and production.
>
> **Reference:** [GitHub OAuth Apps documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)

#### Google OAuth Client

1. Go to [Google Cloud Console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials > OAuth client ID**
3. If prompted, configure the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) first:
   - **User type:** External (or Internal for Google Workspace orgs)
   - **App name:** `Mimir`
   - **Scopes:** `email`, `profile`, `openid`
4. Back on Credentials, select **Web application** as the application type
5. Add **Authorized redirect URIs:** `http://localhost:3001/api/auth/callback/google`
6. Click **Create** and copy the **Client ID** and **Client Secret**

Add to your `.env`:

```bash
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123...
```

> **Production note:** Google requires your app to pass a [verification review](https://support.google.com/cloud/answer/9110914) before external users (outside your Workspace org) can sign in. During development, add test users under the OAuth consent screen.
>
> **Reference:** [Google OAuth 2.0 documentation](https://developers.google.com/identity/protocols/oauth2/web-server)

#### Magic Link Email (Resend)

Magic link authentication sends a one-time sign-in link to the user's email. In development, if no Resend API key is configured, the magic link URL is printed to the API console instead of sent via email.

For production email delivery:

1. Create an account at [resend.com](https://resend.com)
2. Add and verify your sending domain under [Domains](https://resend.com/domains) (e.g., `sindri.dev`)
   - Resend will provide DNS records (SPF, DKIM, DMARC) to add to your domain
   - Verification typically takes a few minutes
3. Create an API key under [API Keys](https://resend.com/api-keys)

Add to your `.env`:

```bash
RESEND_API_KEY=re_abc123...
EMAIL_FROM=noreply@sindri.dev
```

> **Dev mode fallback:** When `NODE_ENV=development` and `RESEND_API_KEY` is not set, the API logs the magic link URL to stdout. Look for the `✉️ Magic link for user@example.com:` line in your terminal.
>
> **Reference:** [Resend documentation](https://resend.com/docs/introduction)

### Environment Variables Summary

| Variable               | Required | Default                 | Description                                                    |
| ---------------------- | -------- | ----------------------- | -------------------------------------------------------------- |
| `BETTER_AUTH_URL`      | No       | `http://localhost:3001` | Base URL for auth callbacks (set to your domain in production) |
| `GITHUB_CLIENT_ID`     | No       | —                       | GitHub OAuth app client ID                                     |
| `GITHUB_CLIENT_SECRET` | No       | —                       | GitHub OAuth app client secret                                 |
| `GOOGLE_CLIENT_ID`     | No       | —                       | Google OAuth client ID                                         |
| `GOOGLE_CLIENT_SECRET` | No       | —                       | Google OAuth client secret                                     |
| `RESEND_API_KEY`       | No       | —                       | Resend API key for magic link emails                           |
| `EMAIL_FROM`           | No       | `noreply@sindri.dev`    | Sender address for magic link emails                           |
| `AUTH_BYPASS`          | No       | —                       | Set to `true` for dev auto-login (dev only)                    |
| `CORS_ORIGIN`          | No       | `http://localhost:5173` | Must include your frontend URL for auth cookies to work        |

None of the auth variables are required — providers are automatically disabled when their credentials are missing. You can run with just GitHub, just Google, just magic link, or any combination.

### Database Migration

The auth system adds three tables (`Session`, `Account`, `Verification`) and modifies the `User` table. The migration runs automatically with the rest:

```bash
make db-migrate    # Applies 20260225000000_add_auth_tables
make db-seed       # Seed users still work — existing password_hash values are preserved
```

### First-User Bootstrap

The first user to sign in to a fresh Mimir instance is automatically promoted to **ADMIN**. This is handled by a `databaseHooks.user.create.before` hook in Better Auth (`apps/api/src/lib/auth.ts`). All subsequent users start as **VIEWER**.

---

## End-User Authentication Guide

### Signing In

Users have three options on the login page (`/login`):

1. **Continue with GitHub** — redirects to GitHub's OAuth consent screen, then back to Mimir
2. **Continue with Google** — redirects to Google's OAuth consent screen, then back to Mimir
3. **Send magic link** — enter an email address, receive a one-time sign-in link

After successful authentication, the browser receives an HttpOnly session cookie (7-day expiry, refreshed daily). The user is redirected to `/dashboard`.

### Magic Link Flow

1. Enter email on the login page and click **Send magic link**
2. Check email for "Sign in to Mimir" message (check spam if not in inbox)
3. Click the **Sign in to Mimir** button in the email (link expires in 15 minutes)
4. Click **Sign in to Mimir** on the verification page

Security properties:

- Token is one-time use — clicking the link a second time shows "link expired"
- Token is hashed (SHA-256) in the database — a database breach doesn't expose valid tokens
- The API always returns success when requesting a magic link — prevents email enumeration
- 15-minute expiry limits the attack window

### Account Linking

If a user signs in with GitHub and later signs in with Google using the same email address, Better Auth automatically links both accounts to the same Mimir user. The user can then sign in with either provider.

Linked accounts are visible on the **Settings > Profile** tab.

### Session Management

- Sessions last **7 days** and are refreshed daily on activity
- Signing out (`POST /api/auth/sign-out`) deletes the session from the database and clears the cookie
- Closing the browser tab does **not** end the session — the cookie persists until expiry or explicit sign-out

### API Keys for CLI Access

After signing in via the browser, users who need programmatic access (CLI scripts, CI/CD pipelines) can self-service API keys:

1. Navigate to **Settings > API Keys**
2. Click **Create key**, give it a name and optional expiry
3. Copy the key immediately — it is shown only once
4. Use the key with `curl` or the Sindri CLI:

```bash
# Header auth (preferred)
curl -H "Authorization: Bearer sk-abc123..." https://mimir.example.com/api/v1/instances

# Alternative header
curl -H "X-Api-Key: sk-abc123..." https://mimir.example.com/api/v1/instances
```

### Role Limitations

New users start as **VIEWER** and can only read dashboards, metrics, and logs. To unlock write operations (deploy, terminal, commands), contact an admin to upgrade your role or assign you to a team. See [RBAC.md](RBAC.md) for the full permission matrix.

---

## Compute Catalog Setup

The deployment wizard (Step 3) fetches live compute sizes and pricing from each cloud provider's API. See [ADR-0004](./adr/0004-dynamic-compute-catalog.md) and [ADR-0005](./adr/0005-provider-pricing-data-sources.md) for the design rationale.

### How It Works

A background worker runs every 4 hours, fetching compute catalogs from each enabled provider and caching the results in Redis. The frontend calls `GET /api/v1/providers/:provider/compute-catalog` which serves from cache. If no API key is configured for a given provider, static fallback pricing from `apps/api/src/services/costs/pricing.ts` is used automatically.

### Provider API Keys

Live pricing requires API keys for authenticated providers. All keys are optional — providers without keys gracefully fall back to static data.

| Env Variable                   | Provider     | How to Obtain                                                                                                                                               |
| ------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRICING_FLY_API_TOKEN`        | Fly.io       | `fly auth token` or [Fly.io Dashboard > Access Tokens](https://fly.io/user/personal_access_tokens)                                                          |
| `PRICING_RUNPOD_API_KEY`       | RunPod       | [RunPod Console > Settings > API Keys](https://www.runpod.io/console/user/settings)                                                                         |
| `PRICING_NORTHFLANK_API_TOKEN` | Northflank   | [Northflank Dashboard > Account > API](https://app.northflank.com/account/api)                                                                              |
| `PRICING_GCP_API_KEY`          | GCP          | [Google Cloud Console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials) — create an API key with Cloud Billing API access |
| `PRICING_DIGITALOCEAN_TOKEN`   | DigitalOcean | [DigitalOcean Dashboard > API > Tokens](https://cloud.digitalocean.com/account/api/tokens)                                                                  |

> **Note:** Pricing tokens use a `PRICING_` prefix to avoid collision with deployment credentials. The sindri CLI looks for `FLY_API_TOKEN`, `RUNPOD_API_KEY`, etc. — `PRICING_*` vars are invisible to the CLI subprocess, preventing accidental use of operator keys for user deployments.

Add them to your `.env`:

```bash
# Optional — providers without keys use static fallback pricing
PRICING_FLY_API_TOKEN=fo1_abc123...
PRICING_RUNPOD_API_KEY=abc123...
PRICING_NORTHFLANK_API_TOKEN=abc123...
PRICING_GCP_API_KEY=AIza...
PRICING_DIGITALOCEAN_TOKEN=dop_v1_abc123...
```

AWS and Azure use public pricing APIs and require no authentication.

### Refresh Schedule

Each provider has a default refresh interval. The catalog worker runs every 4 hours and refreshes all enabled providers:

| Provider   | Default Refresh | Default Cache TTL |
| ---------- | --------------- | ----------------- |
| Fly.io     | Every 6h        | 6h                |
| RunPod     | Every 4h        | 4h                |
| Northflank | Every 12h       | 12h               |
| AWS        | Daily           | 24h               |
| GCP        | Daily           | 24h               |
| Azure      | Daily           | 24h               |
| E2B        | Formula-based   | 24h               |
| Docker     | Static          | Never expires     |
| Kubernetes | Static          | Never expires     |

Admins can force an immediate refresh via the API:

```bash
curl -X POST -H "Authorization: Bearer <admin-api-key>" \
  http://localhost:3001/api/v1/providers/fly/compute-catalog/refresh
```

### Overriding Configuration

#### Per-provider env vars

Override refresh interval, TTL, or disable a provider entirely:

```bash
CATALOG_FLY_TTL=3600              # Cache TTL in seconds
CATALOG_FLY_INTERVAL_MS=7200000   # Refresh interval in ms
CATALOG_AWS_ENABLED=false          # Disable AWS catalog fetching
```

#### JSON config file

For more complex overrides, point `CATALOG_CONFIG` to a JSON file:

```bash
CATALOG_CONFIG=/etc/mimir/catalog.json
```

```json
{
  "providers": {
    "fly": {
      "ttl_seconds": 3600,
      "refresh_interval_ms": 7200000
    },
    "aws": {
      "enabled": false
    }
  }
}
```

### Custom Pricing for Docker and Kubernetes

Docker and Kubernetes show $0 pricing by default since costs depend on your infrastructure. To set custom prices (e.g., for internal chargeback):

```bash
# Docker custom per-hour pricing
CATALOG_DOCKER_SMALL_PRICE_HR=0.05
CATALOG_DOCKER_MEDIUM_PRICE_HR=0.10
CATALOG_DOCKER_LARGE_PRICE_HR=0.20
CATALOG_DOCKER_XLARGE_PRICE_HR=0.40

# Kubernetes custom per-hour pricing
CATALOG_K8S_SMALL_PRICE_HR=0.03
CATALOG_K8S_MEDIUM_PRICE_HR=0.06
CATALOG_K8S_LARGE_PRICE_HR=0.12
CATALOG_K8S_XLARGE_PRICE_HR=0.24
```

### Maintaining Instance Allowlists

AWS, GCP, and Azure use curated allowlists to limit the number of instance types fetched (the full AWS pricing index is 100s of MB). When new instance generations launch, update the allowlist in:

- **AWS**: `apps/api/src/services/catalog/fetchers/aws.fetcher.ts` — `INSTANCE_ALLOWLIST` and `INSTANCE_SPECS`
- **GCP**: `apps/api/src/services/catalog/fetchers/gcp.fetcher.ts` — `MACHINE_TYPES`
- **Azure**: `apps/api/src/services/catalog/fetchers/azure.fetcher.ts` — `VM_ALLOWLIST` and `VM_SPECS`

### Verifying Catalog Data

#### Inspect via the API

Check what each provider returns, including data source and freshness:

```bash
# Fly.io catalog
curl -s http://localhost:3001/api/v1/providers/fly/compute-catalog | jq .

# All providers (repeat for: runpod, aws, gcp, azure, e2b, northflank, docker, kubernetes, devpod)
curl -s http://localhost:3001/api/v1/providers/aws/compute-catalog | jq .
```

The response includes:

- **`source`**: `"live"` (fresh from API), `"cached"` (from Redis), or `"fallback"` (static data)
- **`fetched_at`**: ISO timestamp of when the data was last pulled

#### Inspect Redis cache directly

```bash
redis-cli GET catalog:fly | jq .
redis-cli TTL catalog:fly         # seconds until cache expires
redis-cli GET catalog:aws | jq .
```

#### Force refresh

```bash
curl -X POST -H "Authorization: Bearer <admin-api-key>" \
  http://localhost:3001/api/v1/providers/fly/compute-catalog/refresh | jq .
```

#### Cross-check against provider APIs

Verify that Mimir's catalog matches the raw provider data:

**Fly.io** (GraphQL):

```bash
curl -s -X POST https://api.fly.io/graphql \
  -H "Authorization: Bearer $PRICING_FLY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ platform { vmSizes { name cpuCores memoryGb priceMonth priceSecond } } }"}' | jq .
```

**RunPod** (GraphQL):

```bash
curl -s -X POST https://api.runpod.io/graphql \
  -H "Authorization: Bearer $PRICING_RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ gpuTypes { id displayName memoryInGb securePrice communityPrice } }"}' | jq .
```

**Azure** (public REST — no auth):

```bash
curl -s "https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&\$filter=serviceName%20eq%20'Virtual%20Machines'%20and%20armRegionName%20eq%20'eastus'%20and%20priceType%20eq%20'Consumption'" | jq '.Items[:3]'
```

**GCP** (API key):

```bash
curl -s "https://cloudbilling.googleapis.com/v1/services/6F81-5844-456A/skus?key=$PRICING_GCP_API_KEY&currencyCode=USD&pageSize=5" | jq .
```

### Customizing What Data Is Returned

Each provider fetcher has different levels of customizability:

#### Providers with curated allowlists (most influence)

AWS, GCP, and Azure return thousands of SKUs. The fetchers use allowlists to select a manageable subset of latest-generation instance types. You can add, remove, or modify these:

| Provider | File                                                      | What to edit                                                                                               |
| -------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| AWS      | `apps/api/src/services/catalog/fetchers/aws.fetcher.ts`   | `INSTANCE_ALLOWLIST` (family prefixes like `"t3a."`, `"m7i."`) and `INSTANCE_SPECS` (vCPU/memory per type) |
| GCP      | `apps/api/src/services/catalog/fetchers/gcp.fetcher.ts`   | `MACHINE_TYPES` array (id, name, vcpus, memory, series)                                                    |
| Azure    | `apps/api/src/services/catalog/fetchers/azure.fetcher.ts` | `VM_ALLOWLIST` (SKU names) and `VM_SPECS` (vCPU/memory per SKU)                                            |

For example, to add next-gen AWS M8i instances, add `"m8i."` to `INSTANCE_ALLOWLIST` and add specs like `"m8i.large": { vcpus: 2, memory_gb: 8 }` to `INSTANCE_SPECS`.

#### Providers with full API pass-through (no filtering)

Fly.io, RunPod, and Northflank return their full catalog. The fetchers pass through whatever the provider API returns — you can't filter from our side. What you see is what the provider offers.

#### Formula-based and static providers (fully configurable)

| Provider   | What you control                         | How                                                         |
| ---------- | ---------------------------------------- | ----------------------------------------------------------- |
| E2B        | Pricing formula constants                | Edit `CPU_PER_HOUR` / `MEM_PER_GB_HOUR` in `e2b.fetcher.ts` |
| E2B        | Available size combos                    | Edit `E2B_SIZES` array in `e2b.fetcher.ts`                  |
| Docker     | Tier definitions (vCPU, memory, storage) | Edit `TIERS` in `docker.fetcher.ts`                         |
| Docker     | Per-tier pricing                         | `CATALOG_DOCKER_*_PRICE_HR` env vars (no code change)       |
| Kubernetes | Tier definitions                         | Edit `TIERS` in `kubernetes.fetcher.ts`                     |
| Kubernetes | Per-tier pricing                         | `CATALOG_K8S_*_PRICE_HR` env vars (no code change)          |
| DevPod     | Generic local/SSH tiers                  | Edit `DEVPOD_SIZES` in `devpod.fetcher.ts`                  |

#### Storage and network pricing

All fetchers fall back to the static values in `apps/api/src/services/costs/pricing.ts` for storage ($/GB/month) and network egress ($/GB + free tier). To update these, edit the corresponding `ProviderPricing` object in that file.

### Troubleshooting

- **"Using static pricing" in the UI**: The API key for that provider is missing or invalid, or the provider's API is down. Check your `.env` and API logs.
- **Stale prices**: Force a refresh via `POST /providers/:provider/compute-catalog/refresh` or restart the API (the worker runs immediately on startup).
- **Redis unavailable**: The catalog service falls back to live API calls on each request (slower but functional). If the API call also fails, static pricing is returned.
- **GCP returns 403**: The Cloud Billing API must be enabled on the GCP project that owns the API key. Visit [Cloud Billing API](https://console.cloud.google.com/apis/library/cloudbilling.googleapis.com) in the correct project and click **Enable**.

---

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
- [RBAC](./RBAC.md) — full authorization matrix and team-scoped access control
- [ADR-0002](./adr/0002-oidc-magic-link-authentication.md) — authentication design decisions
- [ADR-0003](./adr/0003-rbac-authorization-model.md) — authorization model design decisions
- [ADR-0004](./adr/0004-dynamic-compute-catalog.md) — dynamic compute catalog architecture
- [ADR-0005](./adr/0005-provider-pricing-data-sources.md) — provider pricing data source decisions
- [ADR-0006](./adr/0006-pricing-credential-isolation.md) — PRICING\_ prefix naming convention
- [ADR-0007](./adr/0007-integration-registry-and-credential-management.md) — integration registry and credential management
