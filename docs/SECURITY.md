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

## Dependencies

- Security advisories are monitored via Dependabot
- `pnpm audit` is available via `make audit`
- Transitive dependency overrides are applied in root `package.json` for known vulnerabilities
