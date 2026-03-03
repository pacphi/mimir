/**
 * API client for integration status and provider credential specs.
 */

import { apiFetch } from "@/lib/api-fetch";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlatformIntegrationStatus {
  id: string;
  name: string;
  description: string;
  setupUrl: string;
  enabledFeatures: string[];
  envVarName: string;
  envVarNames?: string[];
  category: "compute_catalog" | "auth" | "notification";
  required: boolean;
  configured: boolean;
}

export interface ProviderCredentialSpec {
  providerId: string;
  name: string;
  description: string;
  setupUrl: string;
  requiredEnvVars: string[];
  optionalEnvVars?: string[];
  notes?: string;
}

// ─── API calls ──────────────────────────────────────────────────────────────

export function fetchIntegrations() {
  return apiFetch<{ data: PlatformIntegrationStatus[]; total: number }>("/integrations");
}

export function fetchIntegration(id: string) {
  return apiFetch<PlatformIntegrationStatus>(`/integrations/${id}`);
}

export function fetchProviderCredentialSpecs() {
  return apiFetch<{ data: ProviderCredentialSpec[]; total: number }>("/integrations/providers");
}

export function fetchProviderCredentialSpec(providerId: string) {
  return apiFetch<ProviderCredentialSpec>(`/integrations/providers/${providerId}`);
}
