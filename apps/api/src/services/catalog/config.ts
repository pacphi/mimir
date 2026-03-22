/**
 * Default catalog fetcher configuration.
 *
 * Overridable via CATALOG_CONFIG env var (path to JSON file) or
 * individual env vars like CATALOG_FLY_TTL, CATALOG_FLY_INTERVAL_MS.
 */

import { readFileSync } from "fs";
import type { CatalogConfig, CatalogFetcherConfig } from "./types.js";

const HOUR = 60 * 60 * 1000;

const DEFAULT_CONFIG: CatalogConfig = {
  providers: {
    fly: {
      enabled: true,
      api_key_env: "PRICING_FLY_API_TOKEN",
      refresh_interval_ms: 6 * HOUR,
      ttl_seconds: 6 * 3600,
      supports_regional_pricing: true,
    },
    runpod: {
      enabled: true,
      api_key_env: "PRICING_RUNPOD_API_KEY",
      refresh_interval_ms: 4 * HOUR,
      ttl_seconds: 4 * 3600,
      supports_regional_pricing: false,
    },
    northflank: {
      enabled: true,
      api_key_env: "PRICING_NORTHFLANK_API_TOKEN",
      refresh_interval_ms: 12 * HOUR,
      ttl_seconds: 12 * 3600,
      supports_regional_pricing: false,
    },
    aws: {
      enabled: true,
      api_key_env: "PRICING_AWS_ACCESS_KEY_ID",
      secret_key_env: "PRICING_AWS_SECRET_ACCESS_KEY",
      refresh_interval_ms: 24 * HOUR,
      ttl_seconds: 24 * 3600,
      supports_regional_pricing: true,
    },
    gcp: {
      enabled: true,
      api_key_env: "PRICING_GCP_API_KEY",
      refresh_interval_ms: 24 * HOUR,
      ttl_seconds: 24 * 3600,
      supports_regional_pricing: true,
    },
    azure: {
      enabled: true,
      refresh_interval_ms: 24 * HOUR,
      ttl_seconds: 24 * 3600,
      supports_regional_pricing: true,
    },
    e2b: {
      enabled: true,
      refresh_interval_ms: 24 * HOUR,
      ttl_seconds: 24 * 3600,
      supports_regional_pricing: false,
    },
    docker: {
      enabled: true,
      refresh_interval_ms: 0, // static — no refresh
      ttl_seconds: 0, // never expires
      supports_regional_pricing: false,
    },
    kubernetes: {
      enabled: true,
      refresh_interval_ms: 0,
      ttl_seconds: 0,
      supports_regional_pricing: false,
    },
    devpod: {
      enabled: true,
      refresh_interval_ms: 0,
      ttl_seconds: 0,
      supports_regional_pricing: false,
    },
    digitalocean: {
      enabled: true,
      api_key_env: "PRICING_DIGITALOCEAN_TOKEN",
      refresh_interval_ms: 24 * HOUR,
      ttl_seconds: 24 * 3600,
      supports_regional_pricing: false,
    },
  },
};

function loadOverrideFile(): Partial<CatalogConfig> | null {
  const configPath = process.env.CATALOG_CONFIG;
  if (!configPath) return null;
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Partial<CatalogConfig>;
  } catch {
    return null;
  }
}

function applyEnvOverrides(provider: string, config: CatalogFetcherConfig): CatalogFetcherConfig {
  const prefix = `CATALOG_${provider.toUpperCase()}`;
  const ttl = process.env[`${prefix}_TTL`];
  const interval = process.env[`${prefix}_INTERVAL_MS`];
  const enabled = process.env[`${prefix}_ENABLED`];

  return {
    ...config,
    ...(ttl != null ? { ttl_seconds: parseInt(ttl, 10) } : {}),
    ...(interval != null ? { refresh_interval_ms: parseInt(interval, 10) } : {}),
    ...(enabled != null ? { enabled: enabled === "true" } : {}),
  };
}

let resolved: CatalogConfig | null = null;

export function getCatalogConfig(): CatalogConfig {
  if (resolved) return resolved;

  const override = loadOverrideFile();
  const merged: CatalogConfig = { providers: { ...DEFAULT_CONFIG.providers } };

  if (override?.providers) {
    for (const [key, val] of Object.entries(override.providers)) {
      if (merged.providers[key] && val) {
        merged.providers[key] = { ...merged.providers[key], ...val };
      }
    }
  }

  for (const [key, val] of Object.entries(merged.providers)) {
    merged.providers[key] = applyEnvOverrides(key, val);
  }

  resolved = merged;
  return merged;
}
