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
