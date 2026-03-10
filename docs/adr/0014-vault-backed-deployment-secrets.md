# ADR 0014: Vault-Backed Deployment Secrets Lifecycle

**Date:** 2026-03-09
**Status:** Accepted
**Extends:** [ADR 0010 — Deployment Secrets Classification](0010-deployment-secrets-classification.md)

---

## Context

ADR 0010 established the denylist, subprocess isolation, and input validation for deployment secrets. However, it left a critical gap: **secret persistence across the deployment lifecycle**.

### Problems Identified

1. **Secrets lost after initial deploy** — User-provided secrets (e.g., `GITHUB_TOKEN`, `OPENROUTER_API_KEY`) were passed as one-time env vars to the `sindri deploy` subprocess. After the process exited, the values were gone. Redeploys could not resolve them.

2. **Plaintext temp files on disk** — The interim fix wrote secrets to a temp `.env.secrets` file for the Sindri CLI's `--env-file` flag. Even with zero-overwrite cleanup, this exposed plaintext secrets to disk I/O, OS page cache, and potential forensic recovery.

3. **Redeploy was a no-op** — The redeploy endpoint (`POST /instances/:id/redeploy`) set the instance status to `DEPLOYING` and returned, but never invoked `sindri deploy`. The instance was stuck in `DEPLOYING` permanently.

4. **Stale container state on redeploy** — Docker volumes persisted a bootstrap marker from the initial deploy. On container restart, the entrypoint skipped extension installation (including draupnir), leaving the instance with no agent connectivity.

5. **No secret cleanup on destroy** — When an instance was destroyed, its deployment secrets remained in the system indefinitely.

### Options Considered

1. **Temp file with secure cleanup** — Write secrets to disk, zero-overwrite after use. Rejected: secrets still touch disk I/O layer.
2. **Vault-backed storage with in-memory resolution** — Encrypt secrets at rest in the existing `Secret` table, resolve to subprocess env vars at deploy time, never write to disk. Chosen.
3. **External secrets manager (HashiCorp Vault, AWS Secrets Manager)** — Too complex for the current deployment model; can be added later as a backend behind the same interface.

---

## Decision

### V1. Store secrets in vault on successful deploy

After a successful `sindri deploy`, each user-provided secret is encrypted with AES-256-GCM and stored in the `Secret` table:

- **Encryption:** Same AES-256-GCM scheme as the existing vault (per-secret random IV, keyed by `SECRET_VAULT_KEY`)
- **Scoping:** `instance_id` set to the deployed instance, `scope: ["deployment"]` to distinguish from user-managed secrets
- **Upsert:** Uses `(name, instance_id)` unique constraint — redeploys with updated secrets overwrite previous values
- **Audit:** `created_by` tracks the initiating user

```typescript
await storeDeploymentSecrets(instance.id, input.secrets, input.initiated_by);
```

### V2. Resolve secrets from vault on redeploy

The provisioning flow resolves secrets with a priority chain:

1. **Caller-supplied** — user provides overrides in the redeploy request body
2. **Vault** — `resolveDeploymentSecrets(instanceId)` decrypts from the `Secret` table
3. **Server env** — fallback to `process.env` for secrets not in vault (e.g., globally-shared tokens)

Secrets are passed **only via subprocess env vars** — the `buildSubprocessEnv()` function merges them into the isolated subprocess environment. No temp file is written.

### V3. Redeploy executes actual provisioning

The redeploy handler now calls `createDeployment()` with `force: true`, which:

- Invokes `sindri deploy --force --config <tmpfile>` — the `--force` flag tears down the existing container **including volumes**, eliminating stale bootstrap markers
- Registers/updates the instance record in the database
- Stores secrets in the vault (V1)

### V4. Hard-delete secrets on instance destroy

When `destroyInstance()` completes with `finalStatus === "DESTROYED"`:

```typescript
await db.secret.deleteMany({
  where: { instance_id: id, scope: { has: "deployment" } },
});
```

This is a **hard delete** — no soft-delete, no recovery. The encrypted values are removed from the database entirely. Secrets are NOT purged on soft-delete (`STOPPED` status from agent self-deregistration) to preserve the ability to resume.

### V5. Docker networking fix for draupnir connectivity

The console endpoint URL (`SINDRI_CONSOLE_URL`) is rewritten for Docker deployments:

- `localhost` / `127.0.0.1` → `host.docker.internal`
- Applied in `resolveConsoleUrl()` before injection into the YAML `console:` block
- Ensures the draupnir agent inside the container can reach the Mimir API on the host

---

## RBAC Model for Secrets

| Action                                    | VIEWER | DEVELOPER | OPERATOR | ADMIN                  |
| ----------------------------------------- | ------ | --------- | -------- | ---------------------- |
| List secret metadata                      | yes    | yes       | yes      | yes                    |
| View secret metadata                      | yes    | yes       | yes      | yes                    |
| Create / update / rotate / delete         | -      | -         | yes      | yes                    |
| **Reveal plaintext value**                | -      | -         | -        | **yes** (audit-logged) |
| Deploy / redeploy (implicit vault access) | -      | -         | yes      | yes                    |

**Key principle:** Operators can trigger deployments that implicitly resolve secrets from the vault, but they never see the plaintext values. Only Admins can explicitly reveal a secret's value, and this action is audit-logged.

---

## Consequences

### Positive

- **No plaintext on disk** — secrets exist only in encrypted DB rows and in-memory subprocess env
- **Redeploy works** — secrets survive across deployment cycles without user re-entry
- **Destroy is clean** — no orphaned secrets after instance teardown
- **RBAC enforced** — operators deploy without seeing secrets; admins audit-reveal
- **Docker connectivity** — draupnir can reach Mimir from inside containers

### Negative

- **Vault key rotation** requires re-encrypting all secrets (standard practice, not yet implemented)
- **Server env fallback** means globally-available env vars (e.g., `GITHUB_TOKEN`) can leak into any instance's subprocess — acceptable for dev, should be restricted in production via scoping
- **`--force` redeploy is destructive** — volumes are lost; users should backup first if data matters

### Security Properties

| Property           | Mechanism                                                               |
| ------------------ | ----------------------------------------------------------------------- |
| Encryption at rest | AES-256-GCM, per-secret random 96-bit IV                                |
| Key management     | `SECRET_VAULT_KEY` env var (mandatory in production)                    |
| No disk exposure   | Secrets passed via subprocess env only, never `--env-file`              |
| Scope isolation    | `(name, instance_id)` unique constraint prevents cross-instance leakage |
| Lifecycle cleanup  | Hard-delete on destroy; upsert on redeploy                              |
| Access control     | OPERATOR for implicit use; ADMIN for explicit reveal                    |
| Audit trail        | `created_by`, `last_rotated_at`, admin reveal logging                   |

---

## Files Changed

| File                                             | Change                                                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/services/drift/secrets.service.ts` | `storeDeploymentSecrets()`, `resolveDeploymentSecrets()`                                                              |
| `apps/api/src/services/deployments.ts`           | Vault storage after deploy, vault resolution before CLI, removed temp env file, `--force` flag, `resolveConsoleUrl()` |
| `apps/api/src/services/lifecycle.ts`             | Hard-delete deployment secrets on destroy                                                                             |
| `apps/api/src/routes/instances/lifecycle.ts`     | Redeploy calls `createDeployment()` with force, resolves config from latest deployment                                |
