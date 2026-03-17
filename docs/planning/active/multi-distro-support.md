# Mimir — Multi-Distro Support Plan

**Supporting Sindri v3 Multi-Linux Distribution Images**

> Companion to: [sindri-v3-naming-makefile-addendum.md](https://github.com/pacphi/sindri/blob/main/v3/docs/planning/active/sindri-v3-naming-makefile-addendum.md)
> Version 1.0 · March 2026

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

| Distro                 | Base                                        | Default?                          |
| ---------------------- | ------------------------------------------- | --------------------------------- |
| **Ubuntu 24.04**       | `sindri:3.x.x` / `sindri:latest`            | Yes (backward-compatible default) |
| **Fedora 41**          | `sindri:3.x.x-fedora` / `sindri:fedora`     | No                                |
| **openSUSE Leap 15.6** | `sindri:3.x.x-opensuse` / `sindri:opensuse` | No                                |

The Sindri naming plan is fully backward-compatible: unqualified tags (`latest`, `v3`, semver without suffix) continue to resolve to Ubuntu. Mimir will continue to work without changes, but to **expose distro selection as a first-class feature**, the updates below are required.

### Key Sindri Naming Conventions

| Context           | Ubuntu (default)         | Fedora                   | openSUSE                   |
| ----------------- | ------------------------ | ------------------------ | -------------------------- |
| Versioned release | `3.1.0` / `3.1.0-ubuntu` | `3.1.0-fedora`           | `3.1.0-opensuse`           |
| Floating alias    | `latest` / `ubuntu`      | `fedora`                 | `opensuse`                 |
| Local dev build   | `sindri:v3-ubuntu-local` | `sindri:v3-fedora-local` | `sindri:v3-opensuse-local` |
| CI build          | `v3-ci-<sha>-ubuntu`     | `v3-ci-<sha>-fedora`     | `v3-ci-<sha>-opensuse`     |

---

## 2 Current State

Mimir is **distro-agnostic**. There is no concept of Linux distribution anywhere in the codebase:

- **Wizard Step 2** (`Step2ImageVolumes.tsx`) — Users configure registry, version/tag, digest, pull policy. No distro field.
- **Wizard Store** (`deploymentWizardStore.ts`) — `imageConfig` has `registry`, `version`, `tagOverride`, `digest`, `pullPolicy`. No distro.
- **YAML Assembler** (`yaml-assembler.ts`) — Emits `image_config.version` or `deployment.image` directly. No distro-aware tag computation.
- **API Config** (`app.ts:78-85`) — Exposes `SINDRI_DEFAULT_IMAGE` (`"sindri:latest"`), `SINDRI_IMAGE_REGISTRY` (`"ghcr.io/pacphi/sindri"`), `SINDRI_IMAGE_VERSION` (`"latest"`). No distro.
- **API Deployment Service** (`deployments.ts:288`) — Injects `image: sindri:latest` when YAML has no image. No distro awareness.
- **Protocol** (`packages/protocol/src/index.ts`) — `RegistrationPayload` has `os` and `arch` but no `distro`.
- **Prisma Schema** — `Instance` model has no distro field.
- **useAppConfig Hook** (`useAppConfig.ts`) — `AppConfig` has no distro fields.

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

**File:** `apps/web/src/lib/yaml-assembler.ts`

**Changes to `AssemblerInput`:**

```typescript
export interface AssemblerInput {
  // ... existing fields ...
  distro: SindriDistro; // ← new
}
```

**Changes to `assembleYaml()`:**

The tag computation logic must account for distro. The key rules from the Sindri naming convention:

1. **Ubuntu is the default** — unqualified tags (`latest`, `3.1.0`) resolve to Ubuntu
2. **Non-Ubuntu distros require a suffix** — `3.1.0-fedora`, `fedora`, etc.
3. **Dev mode local images** use `sindri:v3-<distro>-local` naming

```typescript
// Helper: compute the effective image tag for a distro
function distroTag(version: string, distro: SindriDistro): string {
  if (distro === "ubuntu") return version; // "latest" or "3.1.0"
  return `${version}-${distro}`; // "latest-fedora" → wait, use alias
}

// Helper: compute dev-mode local image name
function devLocalImage(distro: SindriDistro): string {
  return `sindri:v3-${distro}-local`;
}
```

**Updated image rendering in `assembleYaml()`:**

```typescript
if (hasExplicitImage) {
  lines.push("  image_config:");
  lines.push(`    registry: ${yamlValue(img.registry || imgDefaults.registry)}`);
  if (img.tagOverride) {
    // Power-user override — use as-is
    lines.push(`    tag_override: ${yamlValue(img.tagOverride)}`);
  } else if (img.digest) {
    lines.push(`    digest: ${yamlValue(img.digest)}`);
  } else {
    // Compute distro-aware version tag
    const baseVersion = img.version || imgDefaults.version;
    const effectiveVersion =
      input.distro === "ubuntu" ? baseVersion : `${baseVersion}-${input.distro}`;
    lines.push(`    version: ${yamlValue(effectiveVersion)}`);
  }
  if (img.pullPolicy) lines.push(`    pull_policy: ${img.pullPolicy}`);
  if (img.verifySignature) lines.push("    verify_signature: true");
  if (img.verifyProvenance) lines.push("    verify_provenance: true");
} else if (imgDefaults.isDev) {
  // Dev mode — use distro-specific local image
  lines.push(`  image: sindri:v3-${input.distro}-local`);
} else {
  // Production defaults — distro-aware
  lines.push("  image_config:");
  lines.push(`    registry: ${yamlValue(imgDefaults.registry)}`);
  const effectiveVersion =
    input.distro === "ubuntu" ? imgDefaults.version : `${imgDefaults.version}-${input.distro}`;
  lines.push(`    version: ${yamlValue(effectiveVersion)}`);
}
```

**Edge case — floating aliases:** When `version` is `"latest"` and distro is `fedora`, the correct tag is `fedora` (not `latest-fedora`). Similarly, when `version` is a semver like `3.1.0`, the correct tag is `3.1.0-fedora`. The logic above handles semver correctly but needs a special case for the `"latest"` alias:

```typescript
function computeDistroVersion(baseVersion: string, distro: SindriDistro): string {
  if (distro === "ubuntu") return baseVersion;
  // "latest" → use short distro alias; semver → append suffix
  if (baseVersion === "latest") return distro; // "fedora", "opensuse"
  return `${baseVersion}-${distro}`; // "3.1.0-fedora"
}
```

---

### 4.5 API Deployment Service — Default Image Injection

**File:** `apps/api/src/services/deployments.ts` (around line 288)

**Current behavior:** When YAML has no `image_config:` or `image:`, injects `image: sindri:latest`.

**New behavior:** Must be distro-aware. Two approaches:

**Option A — Parse distro from YAML (recommended):**
If the YAML assembler embeds a distro-specific tag already, the current fallback logic just needs to handle the dev-mode case:

```typescript
const defaultImage = process.env.SINDRI_DEFAULT_IMAGE ?? "sindri:latest";
// The YAML from the wizard already contains distro-aware tags.
// This fallback only fires for expert-mode YAML or API calls with no image.
// Default remains Ubuntu (backward-compatible).
```

No change needed if the wizard always emits an image. But for API-only deployments (no wizard), add a `distro` parameter to the deployment API:

**Option B — Accept distro in deployment request:**

```typescript
// POST /api/v1/deployments body gains optional `distro` field
const distro = body.distro ?? process.env.SINDRI_DEFAULT_DISTRO ?? "ubuntu";
const defaultImage =
  distro === "ubuntu"
    ? (process.env.SINDRI_DEFAULT_IMAGE ?? "sindri:latest")
    : `sindri:v3-${distro}-local`; // dev mode
```

**Recommendation:** Option A for now — the wizard handles it. Add Option B later if the API needs standalone distro support.

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

| #   | Question                                                                                                                            | Impact                                                                           | Owner                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------ |
| 1   | Does Sindri YAML v3.0 support a native `distro` field (e.g., `deployment.distro: fedora`), or is distro selection purely tag-based? | Determines YAML assembler approach — emit `distro:` field vs. compute tag suffix | Sindri                   |
| 2   | Will the Sindri agent report `distro` in its registration payload?                                                                  | Determines whether Mimir can auto-populate the Instance.distro field             | Sindri                   |
| 3   | Should the `POST /api/v1/deployments` API accept a `distro` parameter for API-only callers (no wizard)?                             | Affects API route schema and deployment service                                  | Mimir                    |
| 4   | Should distro selection appear in the Expert mode YAML editor as a helper/hint?                                                     | UX decision                                                                      | Mimir                    |
| 5   | Should the `latest` + non-ubuntu combination use the short alias (`fedora`) or the suffixed form (`latest-fedora`)?                 | Affects tag computation in YAML assembler                                        | Sindri naming convention |
| 6   | Are distro-specific extensions or profiles planned? (e.g., extensions that only work on Fedora)                                     | Could affect Step 3 filtering                                                    | Sindri                   |

---

## 7 Implementation Order

### Phase 1 — Core Wizard Support (P0)

These changes are required for users to select a distro in the Guided Wizard:

| Step | Task                                                  | File(s)                                        | Est. |
| ---- | ----------------------------------------------------- | ---------------------------------------------- | ---- |
| 1    | Add distro env vars to API config endpoint            | `apps/api/src/app.ts`                          | S    |
| 2    | Update `AppConfig` type and defaults                  | `apps/web/src/hooks/useAppConfig.ts`           | S    |
| 3    | Add `distro` to wizard store state + actions          | `apps/web/src/stores/deploymentWizardStore.ts` | S    |
| 4    | Add distro selector UI in Step 2                      | `apps/web/.../Step2ImageVolumes.tsx`           | M    |
| 5    | Update YAML assembler with distro-aware tag logic     | `apps/web/src/lib/yaml-assembler.ts`           | M    |
| 6    | Update API deployment service default image injection | `apps/api/src/services/deployments.ts`         | S    |
| 7    | Update Step 7 review to show distro summary           | `apps/web/.../Step7Review.tsx`                 | S    |
| 8    | Add/update YAML assembler tests                       | `apps/web/src/lib/__tests__/`                  | M    |

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

- **YAML assembler** — Test all distro + version combinations:
  - `ubuntu` + `latest` → `latest`
  - `fedora` + `latest` → `fedora`
  - `opensuse` + `3.1.0` → `3.1.0-opensuse`
  - `ubuntu` + `3.1.0` → `3.1.0`
  - Tag override takes precedence over distro
  - Digest takes precedence over version
  - Dev mode: `ubuntu` → `sindri:v3-ubuntu-local`, `fedora` → `sindri:v3-fedora-local`

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

_Mimir Multi-Distro Support Plan · v1.0 · March 2026_
