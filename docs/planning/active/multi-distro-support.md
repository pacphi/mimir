# Mimir — Multi-Distro Support Plan

**Supporting Sindri v3 Multi-Linux Distribution Images**

> Companion to: [sindri-v3-naming-makefile-addendum.md](https://github.com/pacphi/sindri/blob/main/v3/docs/planning/active/sindri-v3-naming-makefile-addendum.md)
> Version 1.1 · March 2026

---

## Table of Contents

1. [Context](#1-context)
2. [Current State](#2-current-state)
3. [Impact Summary](#3-impact-summary)
4. [Detailed Changes](#4-detailed-changes)
   - [4.1 API App Config](#41-api-app-config)
   - [4.2 Deployment Wizard Store](#42-deployment-wizard-store)
   - [4.3 Guided Wizard Step 2 — Distro Selector](#43-guided-wizard-step-2--distro-selector)
   - [4.4 YAML Assembler — Distro-Aware Tag Computation](#44-yaml-assembler--distro-aware-tag-computation)
   - [4.5 API Deployment Service — Default Image Injection](#45-api-deployment-service--default-image-injection)
   - [4.6 useAppConfig Hook](#46-useappconfig-hook)
   - [4.7 Protocol — Registration Payload](#47-protocol--registration-payload)
   - [4.8 Prisma Schema — Instance Model](#48-prisma-schema--instance-model)
   - [4.9 Fleet UI — Distro Visibility](#49-fleet-ui--distro-visibility)
   - [4.10 Step 7 Review](#410-step-7-review)
5. [What Does NOT Change](#5-what-does-not-change)
6. [Open Questions](#6-open-questions)
7. [Implementation Order](#7-implementation-order)
8. [Testing Strategy](#8-testing-strategy)

---

## 1 Context

Sindri v3 is adding multi-Linux distribution support. The container registry will carry three distinct image variants:

| Distro                 | Base                                               | Default?                          |
| ---------------------- | -------------------------------------------------- | --------------------------------- |
| **Ubuntu 24.04**       | `sindri:3.x.x` / `sindri:latest`                   | Yes (backward-compatible default) |
| **Fedora 41**          | `sindri:3.x.x-fedora` / `sindri:latest-fedora`     | No                                |
| **openSUSE Leap 15.6** | `sindri:3.x.x-opensuse` / `sindri:latest-opensuse` | No                                |

The Sindri naming plan is fully backward-compatible: unqualified tags (`latest`, `v3`, semver without suffix) continue to resolve to Ubuntu. Mimir will continue to work without changes, but to **expose distro selection as a first-class feature**, the updates below are required.

### Key Sindri Naming Conventions

| Context           | Ubuntu (default)           | Fedora                 | openSUSE                 |
| ----------------- | -------------------------- | ---------------------- | ------------------------ |
| Versioned release | `3.1.0` / `3.1.0-ubuntu`   | `3.1.0-fedora`         | `3.1.0-opensuse`         |
| Floating major    | `3` / `3-ubuntu`           | `3-fedora`             | `3-opensuse`             |
| Floating minor    | `3.1` / `3.1-ubuntu`       | `3.1-fedora`           | `3.1-opensuse`           |
| Latest alias      | `latest` / `latest-ubuntu` | `latest-fedora`        | `latest-opensuse`        |
| Distro-only alias | `ubuntu`                   | `fedora`               | `opensuse`               |
| Local dev build   | `sindri:v3-ubuntu-dev`     | `sindri:v3-fedora-dev` | `sindri:v3-opensuse-dev` |
| CI build          | `v3-ci-<sha>-ubuntu`       | `v3-ci-<sha>-fedora`   | `v3-ci-<sha>-opensuse`   |

> **Note:** Per-distro `latest-{distro}` tags were added to the Sindri release workflow in March 2026. The bare `latest` tag remains ubuntu-only for backward compatibility.

---

## 2 Current State

Mimir has **Phase 1 distro support implemented** (as of March 2026). The following are in place:

- **Wizard Step 2** (`Step2ImageVolumes.tsx`) — Distro selector (ubuntu/fedora/opensuse) above the image config fields.
- **Wizard Store** (`deploymentWizardStore.ts`) — `distro` field with `setDistro()` action, defaults to `"ubuntu"`.
- **YAML Assembler** (`yaml-assembler.ts`) — **Provider-aware, distro-aware** image resolution:
  - Dev mode + Docker (local provider): bare local dev image (`sindri:v3-{distro}-dev`)
  - All other cases (prod, dev + cloud providers): `image_config` with GHCR registry + distro-aware `tag_override` (`latest` for ubuntu, `latest-{distro}` for others)
  - The CLI's `resolve_image()` does NOT append distro suffixes, so Mimir computes the full tag.
- **API Config** (`app.ts`) — Exposes `sindriSupportedDistros`, `sindriDefaultDistro`, plus existing image env vars.
- **API Deployment Service** (`deployments.ts`) — **Provider-aware** default image injection:
  - Local providers (docker): bare `image: sindri:v3-{distro}-dev`
  - Cloud providers (fly, etc.): `image_config` with GHCR registry + distro-aware `tag_override`
- **useAppConfig Hook** (`useAppConfig.ts`) — `AppConfig` includes `sindriSupportedDistros` and `sindriDefaultDistro`.

**Not yet implemented (Phase 2/3):**

- **Protocol** (`packages/protocol/src/index.ts`) — `RegistrationPayload` has `os` and `arch` but no `distro`.
- **Prisma Schema** — `Instance` model has no distro field.
- **Fleet UI** — No distro column/filter in instance list.

---

## 3 Impact Summary

| Area                    | Impact | Priority | Files                                                                    |
| ----------------------- | ------ | -------- | ------------------------------------------------------------------------ |
| API App Config          | Medium | P0       | `apps/api/src/app.ts`                                                    |
| Deployment Wizard Store | High   | P0       | `apps/web/src/stores/deploymentWizardStore.ts`                           |
| Guided Wizard Step 2 UI | High   | P0       | `apps/web/src/components/deployment/wizard/guided/Step2ImageVolumes.tsx` |
| YAML Assembler          | High   | P0       | `apps/web/src/lib/yaml-assembler.ts`                                     |
| API Deployment Service  | Medium | P0       | `apps/api/src/services/deployments.ts`                                   |
| useAppConfig Hook       | Medium | P0       | `apps/web/src/hooks/useAppConfig.ts`                                     |
| Protocol Registration   | Low    | P1       | `packages/protocol/src/index.ts`                                         |
| Prisma Schema           | Low    | P1       | `apps/api/prisma/schema.prisma`                                          |
| Fleet UI                | Low    | P2       | Various web components                                                   |
| Step 7 Review           | Low    | P2       | `apps/web/src/components/deployment/wizard/guided/Step7Review.tsx`       |

---

## 4 Detailed Changes

### 4.1 API App Config

**File:** `apps/api/src/app.ts` (lines 78–85)

Add two new environment variables and expose them in `/api/config`:

```typescript
// New env vars:
//   SINDRI_SUPPORTED_DISTROS — comma-separated list (default: "ubuntu,fedora,opensuse")
//   SINDRI_DEFAULT_DISTRO    — default distro (default: "ubuntu")

app.get("/api/config", (c) => {
  return c.json({
    authBypass: isDevAuthBypassEnabled(),
    nodeEnv: process.env.NODE_ENV || "development",
    sindriDefaultImage: process.env.SINDRI_DEFAULT_IMAGE || "sindri:latest",
    sindriImageRegistry: process.env.SINDRI_IMAGE_REGISTRY || "ghcr.io/pacphi/sindri",
    sindriImageVersion: process.env.SINDRI_IMAGE_VERSION || "latest",
    // ── New ───────────────────────────────────────────────────────────
    sindriSupportedDistros: (process.env.SINDRI_SUPPORTED_DISTROS || "ubuntu,fedora,opensuse")
      .split(",")
      .map((s) => s.trim()),
    sindriDefaultDistro: process.env.SINDRI_DEFAULT_DISTRO || "ubuntu",
  });
});
```

**Rationale:** Making the distro list server-configurable allows operators to restrict available distros (e.g., only `ubuntu` and `fedora` in a regulated environment) without rebuilding the frontend.

---

### 4.2 Deployment Wizard Store

**File:** `apps/web/src/stores/deploymentWizardStore.ts`

Add `distro` to state and actions:

```typescript
// ── New type ──────────────────────────────────────────────────────────
export type SindriDistro = "ubuntu" | "fedora" | "opensuse";

export interface DeploymentWizardState {
  // ... existing fields ...

  // Step 2 — Image & Volumes (add to existing group)
  distro: SindriDistro;

  // ...
}

export interface DeploymentWizardActions {
  // ... existing actions ...

  // Step 2 (add to existing group)
  setDistro: (distro: SindriDistro) => void;

  // ...
}

const INITIAL_STATE: DeploymentWizardState = {
  // ... existing fields ...
  distro: "ubuntu", // ← new
  // ...
};
```

**Action implementation:**

```typescript
setDistro: (distro) => set({ distro }),
```

**Note:** Changing distro does NOT need to reset `imageConfig.version` — the YAML assembler will compute the correct tag from the combination of version + distro. If the user has set a `tagOverride`, that takes precedence (power-user escape hatch).

---

### 4.3 Guided Wizard Step 2 — Distro Selector

**File:** `apps/web/src/components/deployment/wizard/guided/Step2ImageVolumes.tsx`

Add a distro selector at the top of the Image Configuration section, before registry/version fields:

```tsx
// New import
import { useAppConfig } from "@/hooks/useAppConfig";

// Inside Step2ImageVolumes():
const { distro, setDistro /* ... existing ... */ } = useDeploymentWizardStore();
const { data: appConfig } = useAppConfig();
const supportedDistros = appConfig?.sindriSupportedDistros ?? ["ubuntu", "fedora", "opensuse"];

// Distro display metadata
const DISTRO_META: Record<string, { label: string; description: string }> = {
  ubuntu: { label: "Ubuntu 24.04", description: "Default — widest compatibility" },
  fedora: { label: "Fedora 41", description: "Latest packages, SELinux, DNF" },
  opensuse: { label: "openSUSE Leap 15.6", description: "Enterprise-grade, Zypper" },
};
```

**UI layout:** A row of selectable cards (similar to provider selection in Step 1), or a `<Select>` dropdown. The selected distro should show the distro name and a brief description. Place it above the existing registry/version fields under the heading "Base Distribution".

**Wireframe:**

```
┌─ Image Configuration ─────────────────────────────────────┐
│                                                            │
│  Base Distribution                                         │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ │
│  │  ● Ubuntu      │ │  ○ Fedora      │ │  ○ openSUSE    │ │
│  │    24.04       │ │    41          │ │    Leap 15.6   │ │
│  │    (default)   │ │                │ │                │ │
│  └────────────────┘ └────────────────┘ └────────────────┘ │
│                                                            │
│  Registry          Version / Tag                           │
│  ┌──────────────┐  ┌──────────────┐                       │
│  │ ghcr.io/...  │  │ latest       │                       │
│  └──────────────┘  └──────────────┘                       │
│  ...                                                       │
└────────────────────────────────────────────────────────────┘
```

---

### 4.4 YAML Assembler — Distro-Aware Tag Computation

> **Status:** ✅ Implemented (March 2026)

**File:** `apps/web/src/lib/yaml-assembler.ts`

`AssemblerInput` includes `distro: SindriDistro` and the assembler is both **provider-aware** and **distro-aware**. Image resolution follows three branches:

1. **Explicit user config** → user-supplied `image_config` fields are honoured as-is
2. **Dev mode + local provider (docker)** → bare local dev image: `sindri:v3-{distro}-dev`
3. **Everything else (prod, or dev + cloud provider)** → `image_config` with GHCR registry + distro-aware `tag_override`

The `LOCAL_PROVIDERS` set (`"docker"`) determines which path is taken. Cloud providers (fly, runpod, devpod, etc.) cannot access local Docker images, so they always use `image_config`.

**Distro tag computation** for the `image_config` path:

```typescript
// Ubuntu uses the base version tag (e.g. "latest")
// Non-ubuntu uses the distro-suffixed form (e.g. "latest-fedora")
const floatingTag =
  input.distro === "ubuntu" ? imgDefaults.version : `${imgDefaults.version}-${input.distro}`;
lines.push(`    tag_override: ${yamlValue(floatingTag)}`);
```

This works because the Sindri release workflow publishes `latest-{distro}` tags for all distros, while the bare `latest` tag remains ubuntu-only for backward compatibility.

**Why `tag_override` instead of `version`:** The CLI's `resolve_image()` semver resolver filters out distro-suffixed tags (since `3.1.0-fedora` parses as a semver prerelease). Using `tag_override` bypasses the resolver and uses the tag directly.

---

### 4.5 API Deployment Service — Default Image Injection

> **Status:** ✅ Implemented (March 2026) — Option A with provider awareness

**File:** `apps/api/src/services/deployments.ts`

The `resolveSystemSecrets()` function is the backend safety net that injects a default image when the YAML has neither `image_config:` nor `image:`. It is now **provider-aware** and **distro-aware**:

1. **Parses `provider:` and `distro:` from the YAML**
2. **Local providers (docker):** Injects bare `image: <SINDRI_DEFAULT_IMAGE>` (local daemon cache)
3. **Cloud providers (fly, etc.):** Injects `image_config:` with GHCR registry + distro-aware `tag_override` (ubuntu → `latest`, fedora → `latest-fedora`, opensuse → `latest-opensuse`)

This safety net only fires for expert-mode YAML or API calls that omit image config. The wizard always emits image config, so it rarely triggers in practice.

---

### 4.6 useAppConfig Hook

**File:** `apps/web/src/hooks/useAppConfig.ts`

Update the `AppConfig` type and defaults:

```typescript
export interface AppConfig {
  authBypass: boolean;
  nodeEnv: string;
  sindriDefaultImage: string;
  sindriImageRegistry: string;
  sindriImageVersion: string;
  // ── New ─────────────────────────────────────────
  sindriSupportedDistros: string[];
  sindriDefaultDistro: string;
}

const DEFAULT_CONFIG: AppConfig = {
  authBypass: false,
  nodeEnv: "development",
  sindriDefaultImage: "sindri:latest",
  sindriImageRegistry: "ghcr.io/pacphi/sindri",
  sindriImageVersion: "latest",
  // ── New ─────────────────────────────────────────
  sindriSupportedDistros: ["ubuntu", "fedora", "opensuse"],
  sindriDefaultDistro: "ubuntu",
};
```

---

### 4.7 Protocol — Registration Payload

**File:** `packages/protocol/src/index.ts`

Add optional `distro` field to `RegistrationPayload`:

```typescript
export interface RegistrationPayload {
  name: string;
  provider: string;
  region: string;
  agentVersion: string;
  os: string;
  arch: string;
  distro?: string; // ← new: "ubuntu" | "fedora" | "opensuse"
  geoLat?: number;
  geoLon?: number;
}
```

**Dependency:** Requires Sindri agent to report distro in its registration message. This is a Sindri-side change — Mimir should accept the field when present and gracefully handle its absence.

---

### 4.8 Prisma Schema — Instance Model

**File:** `apps/api/prisma/schema.prisma`

Add optional `distro` column to `Instance`:

```prisma
model Instance {
  // ... existing fields ...
  distro    String?    // "ubuntu", "fedora", "opensuse" — populated from agent registration
  // ...
}
```

**Migration:** New migration adding nullable `distro` column. Existing instances get `NULL` (unknown/pre-multi-distro).

**Population:** In `registerInstance()` (`apps/api/src/services/instances.ts`), read `distro` from the registration payload and save it.

---

### 4.9 Fleet UI — Distro Visibility

**Files:** Various web components (instance list, detail, fleet overview, geo map)

**Changes:**

- Instance list table: Add "Distro" column with distro name/icon
- Instance detail page: Show distro in the info section
- Fleet overview: Add distro distribution chart (pie/bar)
- Geo map pins: Optionally color-code or badge by distro
- Instance filters: Add distro filter option

**Scope:** This is P2 — nice-to-have after core wizard support ships.

---

### 4.10 Step 7 Review

**File:** `apps/web/src/components/deployment/wizard/guided/Step7Review.tsx`

The YAML preview auto-updates from `assembleYaml()`, so it reflects distro changes automatically. Add a visible summary line:

```
Distribution:  Fedora 41
Provider:      fly
Region:        iad
Image:         ghcr.io/pacphi/sindri:3.1.0-fedora
```

---

## 5 What Does NOT Change

| Area                                                         | Why                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Sindri CLI invocation** (`apps/api/src/lib/cli.ts`)        | CLI handles distro internally; Mimir just passes the YAML config          |
| **Instance lifecycle** (`services/lifecycle.ts`)             | Suspend/resume/destroy are distro-agnostic operations                     |
| **Volumes** (`sindri-constraints.ts`, Step 2 volume section) | Volume configuration is unrelated to distro                               |
| **Extensions / profiles** (Step 3)                           | Extension installation is distro-agnostic (handled by Sindri agent)       |
| **Secrets** (Step 5)                                         | Unchanged                                                                 |
| **Provider options** (Step 6)                                | Unchanged                                                                 |
| **Mimir's own Dockerfiles**                                  | Node.js Alpine images for the control plane; unrelated to Sindri distros  |
| **WebSocket / terminal**                                     | Terminal sessions are distro-agnostic                                     |
| **Makefile** (Mimir root)                                    | Mimir's Makefile targets are for building Mimir itself, not Sindri images |

---

## 6 Open Questions

| #   | Question                                                                                                                            | Impact                                                                           | Status / Owner                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Does Sindri YAML v3.0 support a native `distro` field (e.g., `deployment.distro: fedora`), or is distro selection purely tag-based? | Determines YAML assembler approach — emit `distro:` field vs. compute tag suffix | ✅ Resolved — Sindri supports `deployment.distro` field. Mimir emits it.                                                                                |
| 2   | Will the Sindri agent report `distro` in its registration payload?                                                                  | Determines whether Mimir can auto-populate the Instance.distro field             | Open — Sindri                                                                                                                                           |
| 3   | Should the `POST /api/v1/deployments` API accept a `distro` parameter for API-only callers (no wizard)?                             | Affects API route schema and deployment service                                  | Open — Mimir                                                                                                                                            |
| 4   | Should distro selection appear in the Expert mode YAML editor as a helper/hint?                                                     | UX decision                                                                      | Open — Mimir                                                                                                                                            |
| 5   | Should the `latest` + non-ubuntu combination use the short alias (`fedora`) or the suffixed form (`latest-fedora`)?                 | Affects tag computation in YAML assembler                                        | ✅ Resolved — uses `latest-{distro}` (e.g., `latest-fedora`). Per-distro latest tags added to Sindri release workflow (`release-v3.yml`) in March 2026. |
| 6   | Are distro-specific extensions or profiles planned? (e.g., extensions that only work on Fedora)                                     | Could affect Step 3 filtering                                                    | Open — Sindri                                                                                                                                           |

---

## 7 Implementation Order

### Phase 1 — Core Wizard Support (P0)

These changes are required for users to select a distro in the Guided Wizard:

| Step | Task                                                  | File(s)                                        | Status  |
| ---- | ----------------------------------------------------- | ---------------------------------------------- | ------- |
| 1    | Add distro env vars to API config endpoint            | `apps/api/src/app.ts`                          | ✅ Done |
| 2    | Update `AppConfig` type and defaults                  | `apps/web/src/hooks/useAppConfig.ts`           | ✅ Done |
| 3    | Add `distro` to wizard store state + actions          | `apps/web/src/stores/deploymentWizardStore.ts` | ✅ Done |
| 4    | Add distro selector UI in Step 2                      | `apps/web/.../Step2ImageVolumes.tsx`           | ✅ Done |
| 5    | Update YAML assembler with distro-aware tag logic     | `apps/web/src/lib/yaml-assembler.ts`           | ✅ Done |
| 6    | Update API deployment service default image injection | `apps/api/src/services/deployments.ts`         | ✅ Done |
| 7    | Update Step 7 review to show distro summary           | `apps/web/.../Step7Review.tsx`                 | ✅ Done |
| 8    | Add/update YAML assembler tests                       | `apps/web/tests/yaml-assembler.test.ts`        | ✅ Done |

### Phase 2 — Fleet Visibility (P1)

| Step | Task                                              | File(s)                              | Est. |
| ---- | ------------------------------------------------- | ------------------------------------ | ---- |
| 9    | Add `distro` to protocol `RegistrationPayload`    | `packages/protocol/src/index.ts`     | S    |
| 10   | Add `distro` column to Instance model + migration | `apps/api/prisma/schema.prisma`      | S    |
| 11   | Populate `distro` from agent registration         | `apps/api/src/services/instances.ts` | S    |
| 12   | Add distro to instance API responses              | `apps/api/src/routes/instances/`     | S    |

### Phase 3 — UI Polish (P2)

| Step | Task                                        | File(s)                   | Est. |
| ---- | ------------------------------------------- | ------------------------- | ---- |
| 13   | Distro column in instance list              | Instance list components  | S    |
| 14   | Distro in instance detail page              | Instance detail component | S    |
| 15   | Distro distribution chart in fleet overview | Fleet overview component  | M    |
| 16   | Distro filter in instance list              | Instance list + API query | M    |

_Size: S = small (< 1 hour), M = medium (1–3 hours)_

---

## 8 Testing Strategy

### Unit Tests

- **YAML assembler** — Test all distro + provider + version combinations:
  - `ubuntu` + `latest` → `tag_override: latest`
  - `fedora` + `latest` → `tag_override: latest-fedora`
  - `opensuse` + `latest` → `tag_override: latest-opensuse`
  - `ubuntu` + `3.1.0` → `tag_override: 3.1.0`
  - `fedora` + `3.1.0` → `tag_override: 3.1.0-fedora`
  - Tag override takes precedence over distro
  - Digest takes precedence over version
  - Dev mode + Docker: `ubuntu` → `sindri:v3-ubuntu-dev`, `fedora` → `sindri:v3-fedora-dev`
  - Dev mode + cloud (fly): ubuntu → `image_config` with `tag_override: latest`, fedora → `tag_override: latest-fedora`

- **Wizard store** — `setDistro()` updates state, `reset()` returns to `"ubuntu"`

### Integration Tests

- **Deployment flow** — Deploy with each distro, verify YAML contains correct image tag
- **API config** — Verify `/api/config` returns `sindriSupportedDistros` and `sindriDefaultDistro`
- **Default image injection** — Verify fallback logic injects correct distro-aware image

### Manual / E2E

- Walk through Guided Wizard, select each distro, verify:
  - Step 2 shows correct selection
  - Step 7 YAML preview has correct image tag
  - Deployment succeeds with the selected distro image
- Verify Expert mode YAML with distro-suffixed tags deploys correctly

---

_Mimir Multi-Distro Support Plan · v1.1 · March 2026_
