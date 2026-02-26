# Sindri Version Management

## Overview

Mimir is the fleet management control plane; Sindri is the CLI that runs on managed instances via the Draupnir agent. Version tracking serves two purposes:

1. **Console-side**: Mimir resolves its local Sindri CLI version and exposes it via the API, including a computed `min_instance_version`.
2. **Instance-side**: Each Draupnir agent reports the Sindri CLI version installed on its instance via heartbeat payloads.

These two version sources are independent. Compatibility is determined by matching the **major.minor** segments — patch-level differences are tolerated.

---

## For Operators

### Version Compatibility

The console API computes `min_instance_version` from its own Sindri CLI:

```
Console CLI version: 3.2.5  →  min_instance_version: 3.2.0
```

Only the major and minor components matter. An instance running `3.2.1` is compatible; an instance running `3.1.9` is not.

**Compatibility levels:**

| Badge  | Condition                                                              | Meaning                      |
| ------ | ---------------------------------------------------------------------- | ---------------------------- |
| Green  | Instance version `>=` min_instance_version (same major.minor or newer) | Fully compatible             |
| Yellow | Instance version is older minor (e.g. `3.1.x` vs `3.2.0` minimum)      | Feature gaps possible        |
| Red    | Major version mismatch or version unknown                              | API incompatibilities likely |

### Checking Versions

**Console API version** — `GET /api/v1/version` (authenticated):

```json
{
  "console_api": "0.1.0",
  "sindri_cli": "3.2.5",
  "cli_target": "aarch64-apple-darwin",
  "cli_commit": "a1b2c3d",
  "cli_build_date": "2026-02-20",
  "min_instance_version": "3.2.0",
  "cli_available": true
}
```

When the Sindri CLI is unavailable, `sindri_cli` and `min_instance_version` are `null` and `cli_available` is `false`.

**Live CLI version** — `GET /api/v1/registry/version` (authenticated):

Returns the raw output of `sindri version --json` from the console's local binary:

```json
{
  "version": "3.2.5",
  "commit": "a1b2c3d",
  "build_date": "2026-02-20",
  "target": "aarch64-apple-darwin"
}
```

Returns HTTP 503 with `{ "error": "CLI_UNAVAILABLE", "fallback": true }` when the binary is not found or times out.

**Instance version** — visible in instance details, sourced from the `sindri_version` field on the Instance model (populated by heartbeat).

### Deployment & Version Interaction

- Deployments **do not** enforce version constraints. A deployment will proceed regardless of version mismatch.
- Instances report their Sindri version post-deployment via heartbeat. There is no pre-deployment version check.
- Version mismatches are **observability-only** (badges in the UI), not blocking.

### Configuring the Sindri CLI

| Environment Variable    | Default | Description                          |
| ----------------------- | ------- | ------------------------------------ |
| `SINDRI_BIN_PATH`       | —       | Absolute path to the `sindri` binary |
| `SINDRI_CLI_TIMEOUT_MS` | `15000` | Execution timeout in milliseconds    |

Mimir does not bundle or pin a specific Sindri CLI version — `@sindri/cli` is not listed as a dependency in `package.json`. The binary is expected to be provided externally by the operator.

**Resolution chain** (first match wins):

1. `SINDRI_BIN_PATH` environment variable (explicit path)
2. `./node_modules/.bin/sindri` (local `@sindri/cli` npm package)
3. `sindri` on the system `PATH`
4. Error: `CLI_NOT_FOUND`

The API degrades gracefully when the CLI is unavailable — version endpoints return `null` or 503, and registry endpoints return `{ fallback: true }` so the frontend can hide those sections.

---

## For Maintainers

### Architecture

Version data flows through three independent paths that converge in the frontend:

```
Console CLI binary
  │
  ├─► GET /api/v1/version
  │     → { sindri_cli, min_instance_version, cli_available, ... }
  │
  └─► GET /api/v1/registry/version
        → { version, commit, build_date, target }

Draupnir Agent (per instance)
  │
  └─► heartbeat:ping (WebSocket)
        → { sindri_version?, cli_target?, cpuPercent, ... }
        → gateway.ts processHeartbeat()
        → Instance.sindri_version, Instance.cli_target (DB)

Frontend
  │
  ├── reads /api/v1/version → gets min_instance_version
  ├── reads Instance.sindri_version → gets per-instance version
  └── compares → renders compatibility badge
```

### Code Paths

| File                                 | Role                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/routes/version.ts`     | `/api/v1/version` endpoint; calls `runCliJson(["version"])`, computes `min_instance_version` as `major.minor.0`                  |
| `apps/api/src/routes/registry.ts`    | `/api/v1/registry/version` endpoint; returns raw CLI output, 503 on failure                                                      |
| `apps/api/src/lib/cli.ts`            | Binary resolution (`getSindriBin()`), `runCliJson<T>()` executor with timeout, ANSI stripping, JSON extraction                   |
| `apps/api/src/agents/gateway.ts`     | `processHeartbeat()` — extracts `sindri_version` and `cli_target` from heartbeat payload, conditionally writes to Instance model |
| `apps/api/src/websocket/channels.ts` | `HeartbeatPayload` type — defines `sindri_version?` and `cli_target?` fields                                                     |

### Instance Model Fields

Two nullable fields on the Instance model store version information:

| Field            | Type      | Source            | Notes                                                   |
| ---------------- | --------- | ----------------- | ------------------------------------------------------- |
| `sindri_version` | `String?` | Heartbeat payload | Sindri CLI version (e.g. `"3.2.5"`)                     |
| `cli_target`     | `String?` | Heartbeat payload | Rust target triple (e.g. `"x86_64-unknown-linux-musl"`) |

These are updated **conditionally** in `processHeartbeat()`: only written when the corresponding field is present (truthy) in the heartbeat payload. This means:

- A new instance with no heartbeat yet will have `null` for both fields.
- Once an agent reports its version, subsequent heartbeats without version fields will not clear the stored values.

The update happens in two `updateMany` calls — one for instances transitioning from `ERROR`/`UNKNOWN` to `RUNNING`, and a second for instances already in other statuses. Both apply the same version fields.

### Future: Minimum Version Enforcement

Currently version tracking is observability-only. To add enforcement:

**Where to add it:** Deployment creation handler in `apps/api/src/routes/deployments.ts`. Before creating a deployment, compare the target instance's `sindri_version` against `min_instance_version`.

**Edge cases to handle:**

- New instances with `sindri_version = null` (no heartbeat received yet)
- Console CLI unavailable (`min_instance_version` is `null`)
- Pre-release or dev versions that don't follow semver
- Fleet-wide deployments where some instances are compatible and others are not

**Possible additions:**

- `VERSION_MISMATCH` alert rule type added to the `AlertRuleType` enum
- `SINDRI_MIN_VERSION` environment variable to override the computed minimum
- Soft enforcement (warn but allow) vs hard enforcement (reject deployment)

---

## See Also

- [Maintainer Guide](./MAINTAINER.md) — local development with unreleased Sindri builds
- [Architecture](./ARCHITECTURE.md) — system design and data flow
- [API Reference](./API_REFERENCE.md) — REST endpoint documentation
- [WebSocket Protocol](./WEBSOCKET_PROTOCOL.md) — heartbeat channel details
- [Database Schema](./DATABASE_SCHEMA.md) — Instance model fields
