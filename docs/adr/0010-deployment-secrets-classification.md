# ADR 0010: Deployment Secrets Classification

**Date:** 2026-03-03
**Status:** Accepted

---

## Context

Users deploy Sindri instances via the deployment wizard (JSON secrets) or Expert YAML mode. Two security issues were identified:

1. **System-critical env var override** — users could set `AUTHORIZED_KEYS`, `SINDRI_*`, `DRAUPNIR_*`, `DATABASE_URL`, or `JWT_SECRET` as deployment secrets, overriding platform-managed values and potentially gaining unauthorized access.
2. **Server secret leakage** — `runCliCapture()` used `{ ...process.env, ...userSecrets }` to build the subprocess environment, meaning all server-internal secrets (`DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `SECRET_VAULT_KEY`) were passed to the sindri CLI subprocess.

### Options Considered

1. **Runtime warning only** — log violations but allow them through. Insufficient — the attack still succeeds.
2. **Denylist with hard block** — reject deployments containing reserved keys with a 422 error. Chosen.
3. **Secret namespace isolation** — prefix all user secrets with `USER_`. Too disruptive to existing sindri CLI `secrets:` YAML format.

---

## Decision

### B1. Secret denylist module

New `secret-denylist.ts` module with:

- `RESERVED_SECRET_KEYS: Set<string>` — exact keys: `AUTHORIZED_KEYS`, `DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `SECRET_VAULT_KEY`, `REDIS_URL`, etc.
- `RESERVED_SECRET_PREFIXES: string[]` — prefix patterns: `SINDRI_`, `DRAUPNIR_`, `PRICING_`
- `isReservedSecretKey(key: string): boolean` — case-insensitive check against both sets.

### B2. Zod schema validation

`CreateDeploymentSchema.secrets` gains a `.superRefine()` that calls `isReservedSecretKey()` on each key. Returns 422 with offending key names.

### B3. Expert YAML scanning

New `validateYamlSecrets(yaml)` function scans for `env:` and `secrets:` blocks using line-by-line parsing (same pattern as `parseExtensionsFromYaml`). Called before the provisioning flow. Returns 422 with violating keys.

### B4. AUTHORIZED_KEYS injection from DB

`resolveConsolePlaceholders` is extended to `resolveSystemSecrets`, which also handles platform-managed key injection. Currently wraps the existing function; future work will inject `AUTHORIZED_KEYS` from the `SshKey` table.

### B5. Subprocess environment isolation

Replace `{ ...process.env, ...env }` with `buildSubprocessEnv(userSecrets)` — an explicit allowlist of passthrough variables (`PATH`, `HOME`, `KUBECONFIG`, `DOCKER_HOST`, etc.) merged with user secrets. Server-internal secrets (`DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `SECRET_VAULT_KEY`, `REDIS_URL`) never reach the subprocess.

### B6. Violation audit logging

On denylist violation (Zod or YAML), emit `createAuditLog(CREATE, "deployment", { event: "reserved_key_violation", keys })` before returning 422.

---

## Consequences

### Positive

- Users cannot override platform-managed secrets
- Server-internal secrets never leak to CLI subprocesses
- Violations are audited for security review
- Expert YAML is validated for the same rules as the wizard

### Negative

- The denylist requires maintenance as new reserved prefixes are added
- Expert YAML scanning uses simple line parsing, not a full YAML parser (acceptable tradeoff — avoids heavy YAML dependency)

### Files Changed

| File                                   | Change                                            |
| -------------------------------------- | ------------------------------------------------- |
| `apps/api/src/lib/secret-denylist.ts`  | New — denylist module                             |
| `apps/api/src/lib/cli.ts`              | buildSubprocessEnv allowlist                      |
| `apps/api/src/routes/deployments.ts`   | Zod superRefine, YAML validation, violation audit |
| `apps/api/src/services/deployments.ts` | validateYamlSecrets, resolveSystemSecrets         |
