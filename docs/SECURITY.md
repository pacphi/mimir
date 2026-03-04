# Security Policy

## Supported Versions

| Version      | Supported |
| ------------ | --------- |
| 0.x (latest) | Yes       |

## Reporting a Vulnerability

Please report security vulnerabilities through [GitHub Security Advisories](https://github.com/pacphi/mimir/security/advisories/new).

**Do not** open a public issue for security vulnerabilities.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Potential impact

### Response Timeline

| Severity | Acknowledgment | Fix Target   |
| -------- | -------------- | ------------ |
| Critical | 24 hours       | 72 hours     |
| High     | 48 hours       | 1 week       |
| Medium   | 1 week         | 2 weeks      |
| Low      | 2 weeks        | Next release |

## RBAC Model

Mimir uses role-based access control with four hierarchical roles:

| Role        | Level | Capabilities                                                                    |
| ----------- | ----- | ------------------------------------------------------------------------------- |
| `VIEWER`    | 0     | Read-only access to dashboards, metrics, logs, alerts                           |
| `DEVELOPER` | 1     | + Execute commands on instances, open terminal sessions                         |
| `OPERATOR`  | 2     | + Manage instances, alerts, deployments, budgets, secrets                       |
| `ADMIN`     | 3     | + User/team management, delete resources, reveal secret values, view audit logs |

Roles are enforced at the API layer via the `requireRole(minimumRole)` middleware. Team-scoped roles are managed through the `TeamMember` model.

## API Key Security

- API keys are hashed with **SHA-256** before storage
- The raw key is never persisted — only the hash is stored in `ApiKey.key_hash`
- Keys can have an optional expiration date (`expires_at`)
- Expired keys are rejected at authentication time
- Key usage is tracked asynchronously (`last_used_at`)

### Authentication Headers

```
Authorization: Bearer <api-key>
```

Or:

```
X-Api-Key: <api-key>
```

WebSocket connections accept keys via header or query parameter (`?apiKey=<key>` for browser clients).

## Audit Logging

All significant actions are recorded in the `AuditLog` table:

- User identity, IP address, user agent
- Action type (CREATE, UPDATE, DELETE, LOGIN, DEPLOY, etc.)
- Resource type and ID
- Arbitrary metadata (JSON)
- Timestamp

Audit logs are retained for 365 days by default (`AUDIT_RETENTION_DAYS`).

## Terminal Session Security

Terminal sessions (remote shell access to Sindri instances) enforce the following guardrails:

### Role Requirements

| Action                                    | Minimum Role | Enforcement                    |
| ----------------------------------------- | ------------ | ------------------------------ |
| Open terminal session (`terminal:create`) | `DEVELOPER`  | WebSocket handler RBAC check   |
| Send terminal data (`terminal:data`)      | `DEVELOPER`  | Inherited from session creator |
| Execute commands (`command:exec`)         | `DEVELOPER`  | WebSocket handler RBAC check   |
| View metrics / logs / heartbeat           | `VIEWER`     | Read-only, no shell access     |

### Session Audit Trail

All terminal session lifecycle events are recorded:

- `CONNECT` audit log when a session is created (includes userId, instanceId, sessionId)
- `DISCONNECT` audit log when a session is closed (includes reason: user-initiated, idle_timeout, etc.)
- `TerminalSession` database record tracks start/end times and status

### Idle Timeout

Sessions inactive for longer than `TERMINAL_IDLE_TIMEOUT_MS` (default: 3,600,000 ms / 1 hour) are automatically closed. The server sends a `terminal:close` envelope with `reason: "idle_timeout"` and persists the closure.

Configure via environment variable:

```
TERMINAL_IDLE_TIMEOUT_MS=1800000  # 30 minutes
```

### Agent Identity Validation

When a connection presents an `X-Instance-ID` header, the server validates the ID exists in the `Instance` database table before accepting the connection. Unknown instance IDs are rejected with an `UNKNOWN_INSTANCE` auth error.

Agent connections are flagged with `isAgent: true` on the authenticated principal. Only agent connections may send metrics, heartbeats, and instance events.

### Session Tokens

Each terminal session receives a server-generated 32-byte random hex token stored in Redis with a 5-minute TTL. The TTL is refreshed on each `terminal:data` message. This provides defense-in-depth against session hijacking.

## Deployment Secrets Policy

Deployment secrets are classified into three tiers:

### Secret Classification

| Category              | Examples                                                                                           | Policy                             |
| --------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Reserved (exact)**  | `AUTHORIZED_KEYS`, `DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `SECRET_VAULT_KEY`, `REDIS_URL` | Blocked — cannot be set by users   |
| **Reserved (prefix)** | `SINDRI_*`, `DRAUPNIR_*`, `PRICING_*`                                                              | Blocked — managed by the platform  |
| **User secrets**      | `FLY_API_TOKEN`, `RUNPOD_API_KEY`, custom vars                                                     | Allowed — passed to CLI subprocess |

### SSH Key Management

SSH keys (`AUTHORIZED_KEYS`) are managed exclusively through the Mimir UI and API:

- User SSH keys are stored in the `SshKey` model
- Keys are injected by the platform during deployment via `resolveSystemSecrets`
- Users cannot override `AUTHORIZED_KEYS` via the deployment wizard or Expert YAML

### Expert Mode Guardrails

Expert YAML (`yaml_config`) is scanned for reserved keys in `env:` and `secrets:` blocks before the provisioning flow begins. Violations return a 422 error with the offending key names.

### Subprocess Environment Isolation

CLI subprocesses receive an **explicit allowlist** of environment variables (`PATH`, `HOME`, `KUBECONFIG`, `DOCKER_HOST`, etc.) plus user-provided secrets. Server-internal secrets (`DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `SECRET_VAULT_KEY`, `REDIS_URL`) are **never** passed to the subprocess.

### Violation Audit Logging

All secret denylist violations (wizard or Expert YAML) are recorded in the audit log with:

- Action: `CREATE`
- Resource: `deployment`
- Metadata: `{ event: "reserved_key_violation", keys: [...] }`

## Dependencies

- Security advisories are monitored via Dependabot
- `pnpm audit` is available via `make audit`
- Transitive dependency overrides are applied in root `package.json` for known vulnerabilities
