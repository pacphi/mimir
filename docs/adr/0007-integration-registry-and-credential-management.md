# ADR 0007: Integration Registry and Runtime Credential Management

**Date:** 2026-03-03
**Status:** Accepted

---

## Context

Mimir has several categories of credentials:

1. **User Console API Keys** — `ApiKey` table, SHA-256 hashed, `sk-` prefixed, show-once (existing, working well).
2. **Secrets Vault** — `Secret` table, AES-256-GCM encrypted, for general-purpose secrets (existing, working well).
3. **Platform credentials** — server-level env vars for pricing APIs, OAuth providers, and email delivery. Previously undiscoverable: no UI showed which were configured, and adding/changing them required a server restart.
4. **Deployment credentials** — user-provided keys for provisioning infrastructure (e.g., `FLY_API_TOKEN`). Previously, the deployment wizard had no provider-aware guidance about what credentials each provider requires.

### Problems

- No visibility into which platform integrations are configured vs. missing.
- No feature gating — the UI doesn't adapt based on configured credentials.
- Users deploying to a provider had no guidance about what credentials to supply in Step 5 (Secrets).
- Changing server-level pricing keys required restarting the API server.

---

## Decision

### Integration Registry (Static Manifest)

Introduce a static integration manifest (`apps/api/src/lib/integration-manifest.ts`) with two arrays:

1. **Platform integrations** (8 entries) — server-level credentials for pricing, auth, and notifications. Each entry includes: `id`, `name`, `envVarName`, `category`, `setupUrl`, and `enabledFeatures`.
2. **Provider credential specs** (10 entries) — describes what users must supply per deployment provider. Each entry includes: `providerId`, `requiredEnvVars`, `optionalEnvVars`, `setupUrl`, and `notes`.

### Integration Status API

New routes at `GET /api/v1/integrations` and `GET /api/v1/integrations/providers` return integration metadata with a `configured: boolean` flag. **Values are never returned** — only the presence check. Any authenticated user can query status; the Admin Integrations tab in the UI displays both sections.

### Vault-Backed Credential Resolver

A credential resolver (`apps/api/src/lib/credential-resolver.ts`) provides a lookup chain for pricing credentials:

1. Environment variable (checked first, takes priority)
2. Secrets vault entry named `pricing.<id>` with type `API_KEY`
3. `undefined` (no credential available)

This is used by catalog fetchers (called on a timer every 4-24 hours, not hot-path). It enables runtime credential management: an admin can store a pricing key via the UI without restarting the server.

### Feature Gating

- **Step 1 (Provider Selection)**: Providers without live pricing show "Static pricing" label.
- **Step 5 (Secrets)**: Provider-aware credential checklist shows required env vars with completion status above the generic key/value form.
- **Admin Integrations Tab**: Shows configured/unconfigured status, "Set via Vault" button for pricing integrations, and provider credential reference.

### Security Hardening (bundled in this effort)

- **Startup env validation** (`apps/api/src/lib/env-validation.ts`) — Zod schema validates required env vars at boot; hard fail in production if `SECRET_VAULT_KEY` is missing.
- **`key_prefix`** — first 10 chars of raw API key stored for identification without exposing the full key.
- **`last_used_at`** — API key usage tracking fixed (was a no-op writing `data: {}`).
- **Password hashing** — SHA-256 replaced with bcrypt (12 rounds).
- **WebSocket auth** — documented query param risk with comment noting future ticket-based system.

### Architecture

```
Admin UI ─── "Set via Vault" ───> POST /api/v1/secrets (name: "pricing.fly", type: API_KEY)
                                       │
Catalog Fetcher ── resolveProviderKey() ──> 1. process.env[PRICING_FLY_API_TOKEN]
                                           2. vault entry "pricing.fly"
                                           3. undefined → fallback to static data

Integration Status ── GET /api/v1/integrations ──> checks env + vault
                                                   returns { configured: true/false }
```

### Files Added

| File                                                     | Purpose                                         |
| -------------------------------------------------------- | ----------------------------------------------- |
| `apps/api/src/lib/env-validation.ts`                     | Startup env validation                          |
| `apps/api/src/lib/integration-manifest.ts`               | Static platform + provider credential manifests |
| `apps/api/src/lib/credential-resolver.ts`                | Vault-backed credential lookup chain            |
| `apps/api/src/services/integrations.service.ts`          | Integration status service                      |
| `apps/api/src/routes/integrations.ts`                    | Integration status + provider credential routes |
| `apps/web/src/api/integrations.ts`                       | Frontend API client                             |
| `apps/web/src/hooks/useIntegrations.ts`                  | React hooks for integrations                    |
| `apps/web/src/components/admin/IntegrationsTab.tsx`      | Admin integrations tab                          |
| `apps/web/src/components/admin/IntegrationKeyEditor.tsx` | Vault key editor modal                          |

---

## Consequences

**Positive:**

- Operators can see at a glance which integrations are configured.
- Admins can add/change pricing credentials without server restarts.
- Users get provider-specific guidance about what credentials to supply for deployments.
- Feature gating adapts the UI to the configured environment.
- Security hardening fixes several latent issues (no-op `last_used_at`, weak password hashing, missing `SECRET_VAULT_KEY` validation).

**Negative:**

- Adds ~9 new files to the codebase.
- Vault-backed credential resolution adds a DB query per fetcher run (mitigated by only running every 4-24 hours).
- Schema migration required for `key_prefix` and `last_used_at` on `ApiKey`.

**Neutral:**

- Env var always takes priority over vault — vault is a fallback, not a replacement.
- Provider credential specs are static (no runtime check needed — they describe what users must provide, not what's configured).

---

## References

- [ADR-0004](./0004-dynamic-compute-catalog.md) — Dynamic compute catalog architecture
- [ADR-0005](./0005-provider-pricing-data-sources.md) — Provider pricing data sources
- [ADR-0006](./0006-pricing-credential-isolation.md) — PRICING\_ prefix naming convention
