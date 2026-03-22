// ─────────────────────────────────────────────────────────────────────────────
// Pure function: guided wizard state → YAML string
// ─────────────────────────────────────────────────────────────────────────────

import type { ProviderId } from "@/types/provider-options";
import { toApiProvider, toDevpodBackend } from "@/types/provider-options";

/**
 * Providers that run on the local machine and can access the local Docker
 * daemon's image cache. All other providers are "cloud" — they require a
 * registry-accessible image because there is no local daemon.
 */
const LOCAL_PROVIDERS = new Set(["docker"]);

/** Default workspace mount path inside the container. */
const DEFAULT_WORKSPACE_PATH = "/alt/home/developer/workspace";

export type SindriDistro = "ubuntu" | "fedora" | "opensuse";

export interface ImageConfig {
  registry?: string;
  version?: string;
  tagOverride?: string;
  digest?: string;
  pullPolicy?: "always" | "if-not-present" | "never";
  verifySignature?: boolean;
  verifyProvenance?: boolean;
}

export interface VolumeEntry {
  name: string;
  path: string;
  size: string;
}

export interface ImageDefaults {
  registry: string;
  version: string;
  /** Local image name for dev mode (e.g. "sindri:v3-ubuntu-dev") */
  defaultImage: string;
  /** true when NODE_ENV !== "production" */
  isDev: boolean;
}

export interface AssemblerInput {
  name: string;
  provider: ProviderId;
  imageConfig: ImageConfig;
  imageDefaults: ImageDefaults;
  distro: SindriDistro;
  homeDataSizeGb: number;
  volumes: VolumeEntry[];
  profileName: string | null;
  profileExtensions: string[];
  selectedExtensions: string[];
  region: string;
  vmSize: string;
  memoryGb: number;
  vcpus: number;
  storageGb: number;
  secrets: Array<{ key: string; value: string }>;
  providerOptions: Record<string, unknown>;
}

function indent(level: number): string {
  return "  ".repeat(level);
}

function yamlValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (/[\n:#{}[\],&*?|>!%@`]/.test(v) || v === "" || v !== v.trim()) {
      return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return v;
  }
  return String(v);
}

function renderObject(obj: Record<string, unknown>, level: number): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      lines.push(`${indent(level)}${k}:`);
      lines.push(renderObject(v as Record<string, unknown>, level + 1));
    } else if (Array.isArray(v)) {
      lines.push(`${indent(level)}${k}:`);
      for (const item of v) {
        if (typeof item === "object" && item !== null) {
          lines.push(
            `${indent(level + 1)}- ${renderInlineObject(item as Record<string, unknown>)}`,
          );
        } else {
          lines.push(`${indent(level + 1)}- ${yamlValue(item)}`);
        }
      }
    } else {
      lines.push(`${indent(level)}${k}: ${yamlValue(v)}`);
    }
  }
  return lines.join("\n");
}

function renderInlineObject(obj: Record<string, unknown>): string {
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${yamlValue(v)}`);
  return `{ ${parts.join(", ")} }`;
}

/**
 * Per-provider field name mappings from wizard keys → Sindri schema keys.
 * Keys not listed here pass through unchanged.
 */
const PROVIDER_FIELD_MAPS: Record<string, Record<string, string>> = {
  fly: {
    autoStop: "autoStopMachines",
    autoStart: "autoStartMachines",
    org: "organization",
    ha: "highAvailability",
  },
  devpod_aws: {
    subnet: "subnetId",
    securityGroup: "securityGroupId",
  },
};

/**
 * Apply a field-name mapping to a flat options object.
 */
function remapFields(
  opts: Record<string, unknown>,
  fieldMap: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(opts)) {
    result[fieldMap[k] ?? k] = v;
  }
  return result;
}

/**
 * Normalize provider options before YAML rendering.
 * Maps wizard field names to Sindri schema field names and handles
 * structural normalization (e.g. Docker `dind` boolean → struct).
 */
function normalizeProviderOptions(
  provider: string,
  opts: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...opts };

  // Docker: `dind` boolean → struct, strip docker_host (handled separately)
  if (provider === "docker") {
    delete normalized.docker_host;
    if (normalized.dind === true) {
      normalized.dind = { enabled: true };
    } else if (normalized.dind === false) {
      delete normalized.dind;
    }
    return normalized;
  }

  // Apply per-provider field name remapping
  const fieldMap = PROVIDER_FIELD_MAPS[provider];
  if (fieldMap) {
    return remapFields(normalized, fieldMap);
  }

  return normalized;
}

export function assembleYaml(input: AssemblerInput): string {
  const apiProvider = toApiProvider(input.provider);
  const lines: string[] = [];

  // Header
  lines.push('version: "3.0"');
  lines.push(`name: ${input.name || "my-instance"}`);
  lines.push("");

  // Deployment
  lines.push("deployment:");
  lines.push(`  provider: ${apiProvider}`);
  lines.push(`  distro: ${input.distro}`);

  // Image config — provider-aware to ensure portability:
  //   1. Explicit user config → always honoured
  //   2. Dev mode + local provider (docker) → bare local dev image
  //   3. Everything else (prod, or dev + cloud provider) → image_config
  //      with GHCR registry so cloud providers can pull the image
  const img = input.imageConfig;
  const imgDefaults = input.imageDefaults;
  const hasExplicitImage =
    img.registry ||
    img.version ||
    img.tagOverride ||
    img.digest ||
    img.pullPolicy ||
    img.verifySignature ||
    img.verifyProvenance;

  if (hasExplicitImage) {
    // User explicitly configured image fields — always use image_config
    lines.push("  image_config:");
    lines.push(`    registry: ${yamlValue(img.registry || imgDefaults.registry)}`);
    if (img.tagOverride) {
      lines.push(`    tag_override: ${yamlValue(img.tagOverride)}`);
    } else if (img.digest) {
      lines.push(`    digest: ${yamlValue(img.digest)}`);
    } else {
      const baseVersion = img.version || imgDefaults.version;
      lines.push(`    version: ${yamlValue(baseVersion)}`);
    }
    if (img.pullPolicy) lines.push(`    pull_policy: ${img.pullPolicy}`);
    if (img.verifySignature) lines.push("    verify_signature: true");
    if (img.verifyProvenance) lines.push("    verify_provenance: true");
  } else if (imgDefaults.isDev && LOCAL_PROVIDERS.has(apiProvider)) {
    // Dev mode + local provider (docker): use bare local dev image.
    // Built locally via `make v3-docker-build-dev`.
    const devImage = imgDefaults.defaultImage.replace(
      /-(ubuntu|fedora|opensuse)-/,
      `-${input.distro}-`,
    );
    lines.push(`  image: ${devImage}`);
  } else {
    // Production / cloud-dev — use registry-based image_config.
    // The CLI's resolve_image() does NOT append distro to the tag, so we
    // must pick the correct distro-aware floating tag ourselves.
    // GHCR convention: unsuffixed = ubuntu, others get `-{distro}` suffix.
    //   e.g.  3 (ubuntu), 3-fedora, 3-opensuse
    lines.push("  image_config:");
    lines.push(`    registry: ${yamlValue(imgDefaults.registry)}`);
    const floatingTag =
      input.distro === "ubuntu" ? imgDefaults.version : `${imgDefaults.version}-${input.distro}`;
    lines.push(`    tag_override: ${yamlValue(floatingTag)}`);
  }

  // Resources
  if (input.memoryGb || input.vcpus) {
    lines.push("  resources:");
    if (input.memoryGb) lines.push(`    memory: "${input.memoryGb}GB"`);
    if (input.vcpus) lines.push(`    cpus: ${input.vcpus}`);
  }

  // Volumes — Sindri schema uses `workspace` with `path` and `size`
  lines.push("  volumes:");
  lines.push("    workspace:");
  lines.push(`      path: ${DEFAULT_WORKSPACE_PATH}`);
  lines.push(`      size: "${input.homeDataSizeGb}GB"`);
  for (const vol of input.volumes) {
    if (!vol.name) continue;
    lines.push(`    ${vol.name}:`);
    if (vol.path) lines.push(`      path: ${yamlValue(vol.path)}`);
    if (vol.size) lines.push(`      size: ${yamlValue(vol.size)}`);
  }

  lines.push("");

  // Extensions
  lines.push("extensions:");
  if (input.profileName) {
    lines.push(`  profile: ${input.profileName}`);
    const additional = input.selectedExtensions.filter(
      (ext) => !input.profileExtensions.includes(ext),
    );
    if (additional.length > 0) {
      lines.push("  additional:");
      for (const ext of additional.sort()) {
        lines.push(`    - ${ext}`);
      }
    }
  } else {
    const active = [...new Set(["draupnir", ...input.selectedExtensions])].sort();
    lines.push("  active:");
    for (const ext of active) {
      lines.push(`    - ${ext}`);
    }
  }
  lines.push("  auto_install: true");

  // Secrets
  if (input.secrets.length > 0) {
    lines.push("");
    lines.push("secrets:");
    for (const s of input.secrets) {
      lines.push(`  - name: ${yamlValue(s.key)}`);
      lines.push("    source: env");
    }
  }

  // Providers — always emit for non-local providers so region and
  // provider-specific options reach the Sindri CLI.
  const opts = input.providerOptions;
  const hasOpts = Object.keys(opts).length > 0;
  const devpodBackend = toDevpodBackend(input.provider);
  const isCloudProvider = !LOCAL_PROVIDERS.has(apiProvider) && !devpodBackend;

  if (hasOpts || devpodBackend || isCloudProvider) {
    lines.push("");
    lines.push("providers:");

    // Normalize provider options — map wizard field names to Sindri schema names.
    // For DevPod, use the backend name (e.g. "devpod_aws") for field map lookup.
    const normKey = devpodBackend ? `devpod_${devpodBackend}` : apiProvider;
    const normalizedOpts = normalizeProviderOptions(normKey, opts);

    if (devpodBackend) {
      lines.push("  devpod:");
      lines.push(`    type: ${devpodBackend}`);
      if (input.region) {
        lines.push(`    region: ${input.region}`);
      }
      if (hasOpts) {
        lines.push(`    ${devpodBackend}:`);
        lines.push(renderObject(normalizedOpts, 3));
      }
    } else {
      lines.push(`  ${apiProvider}:`);
      // Always include region for cloud providers
      if (isCloudProvider && input.region && !normalizedOpts.region) {
        lines.push(`    region: ${input.region}`);
      }
      if (hasOpts) {
        lines.push(renderObject(normalizedOpts, 2));
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}
