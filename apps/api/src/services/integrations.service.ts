/**
 * Integration status service.
 *
 * Checks env var presence (with vault fallback) for platform integrations
 * and returns provider credential specs. Values are NEVER returned — only
 * the boolean configured flag.
 */

import {
  PLATFORM_INTEGRATIONS,
  PROVIDER_CREDENTIAL_SPECS,
  type PlatformIntegration,
  type ProviderCredentialSpec,
} from "../lib/integration-manifest.js";
import { isProviderKeyConfigured } from "../lib/credential-resolver.js";

export interface PlatformIntegrationStatus extends PlatformIntegration {
  configured: boolean;
}

async function isConfigured(integration: PlatformIntegration): Promise<boolean> {
  const varsToCheck = integration.envVarNames ?? [integration.envVarName];

  // For compute_catalog integrations, check vault fallback too
  if (integration.category === "compute_catalog") {
    const results = await Promise.all(varsToCheck.map((name) => isProviderKeyConfigured(name)));
    return results.every(Boolean);
  }

  // For auth/notification, env var only
  return varsToCheck.every((name) => process.env[name] != null && process.env[name]!.length > 0);
}

export async function getPlatformIntegrationStatuses(): Promise<PlatformIntegrationStatus[]> {
  const results = await Promise.all(
    PLATFORM_INTEGRATIONS.map(async (integration) => ({
      ...integration,
      configured: await isConfigured(integration),
    })),
  );
  return results;
}

export async function getPlatformIntegrationStatus(
  id: string,
): Promise<PlatformIntegrationStatus | undefined> {
  const integration = PLATFORM_INTEGRATIONS.find((i) => i.id === id);
  if (!integration) return undefined;
  return { ...integration, configured: await isConfigured(integration) };
}

export function getProviderCredentialSpecs(): ProviderCredentialSpec[] {
  return PROVIDER_CREDENTIAL_SPECS;
}

export function getProviderCredentialSpec(providerId: string): ProviderCredentialSpec | undefined {
  return PROVIDER_CREDENTIAL_SPECS.find((s) => s.providerId === providerId);
}
