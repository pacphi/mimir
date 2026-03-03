# ADR 0006: Pricing Credential Isolation with PRICING\_ Prefix

**Date:** 2026-03-03
**Status:** Accepted

---

## Context

Mimir has two distinct uses for provider API keys:

1. **Pricing/catalog credentials** — server-level keys used by the Mimir API to fetch live compute pricing (e.g., `FLY_API_TOKEN` for Fly.io pricing). These are operator-managed, read-only scoped.
2. **Deployment credentials** — user-provided keys that the sindri CLI uses to actually provision infrastructure (e.g., `FLY_API_TOKEN` for deploying a Fly Machine).

For Fly.io, RunPod, and Northflank, the pricing and deployment keys share the same environment variable name. Since `runCliCapture()` passes `{ ...process.env, ...userSecrets }` to the CLI subprocess, the server's pricing token silently acts as a deployment key if the user doesn't provide their own. This means all deployments use the operator's account with no per-user isolation — a critical security issue.

### Options Considered

1. **Env sanitization in `runCliCapture()`** — strip known pricing vars before passing to subprocess. Fragile; new providers require updating the sanitization list.
2. **Separate process env namespace** — run the CLI in a clean environment. Too restrictive; the CLI needs many env vars.
3. **Rename pricing env vars with a `PRICING_` prefix** — the sindri CLI looks for `FLY_API_TOKEN`, not `PRICING_FLY_API_TOKEN`, so the collision disappears entirely.

---

## Decision

Rename all server-level pricing credentials with a `PRICING_` prefix. This eliminates the naming collision and makes the purpose self-documenting.

| Old Name (pricing)     | New Name (pricing)             | Deployment Name (unchanged) |
| ---------------------- | ------------------------------ | --------------------------- |
| `FLY_API_TOKEN`        | `PRICING_FLY_API_TOKEN`        | `FLY_API_TOKEN`             |
| `RUNPOD_API_KEY`       | `PRICING_RUNPOD_API_KEY`       | `RUNPOD_API_KEY`            |
| `NORTHFLANK_API_TOKEN` | `PRICING_NORTHFLANK_API_TOKEN` | `NORTHFLANK_API_TOKEN`      |
| `GCP_BILLING_API_KEY`  | `PRICING_GCP_API_KEY`          | (N/A — different key type)  |
| `DO_API_TOKEN`         | `PRICING_DIGITALOCEAN_TOKEN`   | `DIGITALOCEAN_TOKEN`        |

With distinct names, there is no accidental leakage — the server's `PRICING_*` vars won't be picked up by the sindri CLI (which looks for `FLY_API_TOKEN`, etc.). No env sanitization logic is needed.

### Files Changed

- `apps/api/src/services/catalog/config.ts` — `api_key_env` values renamed
- All 5 fetchers in `apps/api/src/services/catalog/fetchers/` — log messages updated
- `.env.example` and `apps/api/.env.example` — env var entries renamed
- `docs/MAINTAINER.md` — env var table and examples updated
- ADR-0004 and ADR-0005 — references updated

---

## Consequences

**Positive:**

- Eliminates silent credential leakage from operator to user deployments.
- Self-documenting: `PRICING_` prefix makes the purpose immediately clear.
- No code-level env sanitization needed — the naming convention handles isolation.
- Backward compatible: existing deployment credentials (`FLY_API_TOKEN`, etc.) are unchanged.

**Negative:**

- Operators must update their `.env` files to use the new `PRICING_*` names.
- Breaking change for existing deployments that rely on the old env var names for pricing.

**Neutral:**

- The `CATALOG_*_TTL` and `CATALOG_*_INTERVAL_MS` env var overrides are unaffected (they configure cache behavior, not credentials).
