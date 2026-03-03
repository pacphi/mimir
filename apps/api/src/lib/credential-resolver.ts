/**
 * Vault-backed credential resolver.
 *
 * Lookup chain for pricing credentials:
 *   1. Environment variable (checked first, takes priority)
 *   2. Secrets vault entry named `pricing.<integrationId>` with type API_KEY
 *   3. undefined (no credential available)
 *
 * Used by catalog fetchers (called on a timer every 4-24 hours, not hot-path).
 */

import { db } from "./db.js";
import { logger } from "./logger.js";

// Lazy import to avoid circular deps — vault crypto is in secrets.service.ts
let _getSecretValueByName: ((name: string) => Promise<string | null>) | null = null;

async function getSecretValueByName(name: string): Promise<string | null> {
  if (!_getSecretValueByName) {
    // Import on first use
    const mod = await import("../services/drift/secrets.service.js");
    _getSecretValueByName = async (secretName: string) => {
      const secret = await db.secret.findFirst({
        where: { name: secretName, type: "API_KEY" },
      });
      if (!secret) return null;
      return mod.getSecretValue(secret.id);
    };
  }
  return _getSecretValueByName(name);
}

/**
 * Map from integration ID to the env var name used for that pricing key.
 * The integration ID matches the manifest entries in integration-manifest.ts.
 */
const INTEGRATION_ENV_MAP: Record<string, string> = {
  "fly-pricing": "PRICING_FLY_API_TOKEN",
  "runpod-pricing": "PRICING_RUNPOD_API_KEY",
  "northflank-pricing": "PRICING_NORTHFLANK_API_TOKEN",
  "gcp-pricing": "PRICING_GCP_API_KEY",
  "digitalocean-pricing": "PRICING_DIGITALOCEAN_TOKEN",
};

/**
 * Resolve a pricing credential by env var name.
 * Checks env var first, then vault under `pricing.<integrationId>`.
 */
export async function resolveProviderKey(envVarName: string): Promise<string | undefined> {
  // 1. Check environment variable
  const envValue = process.env[envVarName];
  if (envValue && envValue.length > 0) {
    return envValue;
  }

  // 2. Find matching integration ID for vault lookup
  const integrationId = Object.entries(INTEGRATION_ENV_MAP).find(
    ([, env]) => env === envVarName,
  )?.[0];

  if (!integrationId) return undefined;

  // 3. Check vault
  try {
    const vaultName = `pricing.${integrationId.replace("-pricing", "")}`;
    const value = await getSecretValueByName(vaultName);
    if (value) {
      logger.debug({ integration: integrationId }, "Resolved pricing key from vault");
      return value;
    }
  } catch (err) {
    logger.warn({ err, envVarName }, "Failed to resolve pricing key from vault");
  }

  return undefined;
}

/**
 * Check if a pricing credential is available (env var OR vault).
 */
export async function isProviderKeyConfigured(envVarName: string): Promise<boolean> {
  const key = await resolveProviderKey(envVarName);
  return key != null;
}
