// ─────────────────────────────────────────────────────────────────────────────
// Pure function: guided wizard state → YAML string
// ─────────────────────────────────────────────────────────────────────────────

import type { ProviderId } from "@/types/provider-options";
import { toApiProvider, toDevpodBackend } from "@/types/provider-options";

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

export interface AssemblerInput {
  name: string;
  provider: ProviderId;
  imageConfig: ImageConfig;
  volumes: VolumeEntry[];
  profileName: string | null;
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

  // Image config
  const img = input.imageConfig;
  const hasImageConfig =
    img.registry ||
    img.version ||
    img.tagOverride ||
    img.digest ||
    img.pullPolicy ||
    img.verifySignature ||
    img.verifyProvenance;
  if (hasImageConfig) {
    lines.push("  image_config:");
    if (img.registry) lines.push(`    registry: ${yamlValue(img.registry)}`);
    if (img.version) lines.push(`    version: ${yamlValue(img.version)}`);
    if (img.tagOverride) lines.push(`    tag_override: ${yamlValue(img.tagOverride)}`);
    if (img.digest) lines.push(`    digest: ${yamlValue(img.digest)}`);
    if (img.pullPolicy) lines.push(`    pull_policy: ${img.pullPolicy}`);
    if (img.verifySignature) lines.push("    verify_signature: true");
    if (img.verifyProvenance) lines.push("    verify_provenance: true");
  }

  // Resources
  if (input.memoryGb || input.vcpus) {
    lines.push("  resources:");
    if (input.memoryGb) lines.push(`    memory: "${input.memoryGb}GB"`);
    if (input.vcpus) lines.push(`    cpus: ${input.vcpus}`);
  }

  // Volumes
  if (input.volumes.length > 0) {
    lines.push("  volumes:");
    for (const vol of input.volumes) {
      if (!vol.name) continue;
      lines.push(`    ${vol.name}:`);
      if (vol.path) lines.push(`      path: ${yamlValue(vol.path)}`);
      if (vol.size) lines.push(`      size: ${yamlValue(vol.size)}`);
    }
  }

  lines.push("");

  // Extensions
  lines.push("extensions:");
  if (input.profileName) {
    lines.push(`  profile: ${input.profileName}`);
    const profileExtras = input.selectedExtensions.filter(
      (ext) => ext !== "draupnir", // draupnir always included
    );
    // We include additional extensions that aren't part of the profile
    if (profileExtras.length > 0) {
      lines.push("  additional:");
      for (const ext of profileExtras) {
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

  // Secrets
  if (input.secrets.length > 0) {
    lines.push("");
    lines.push("secrets:");
    for (const s of input.secrets) {
      lines.push(`  - name: ${yamlValue(s.key)}`);
      lines.push("    source: env");
    }
  }

  // Provider options
  const opts = input.providerOptions;
  const hasOpts = Object.keys(opts).length > 0;
  const devpodBackend = toDevpodBackend(input.provider);

  if (hasOpts || devpodBackend) {
    lines.push("");
    lines.push("providers:");

    if (devpodBackend) {
      lines.push("  devpod:");
      lines.push(`    type: ${devpodBackend}`);
      if (hasOpts) {
        lines.push(`    ${devpodBackend}:`);
        lines.push(renderObject(opts, 3));
      }
    } else {
      lines.push(`  ${apiProvider}:`);
      if (hasOpts) {
        lines.push(renderObject(opts, 2));
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}
