/**
 * React hooks for integration status and provider credential specs.
 */

import { useQuery } from "@tanstack/react-query";
import {
  fetchIntegrations,
  fetchProviderCredentialSpecs,
  fetchProviderCredentialSpec,
  type PlatformIntegrationStatus,
} from "@/api/integrations";

const STALE_5_MIN = 5 * 60 * 1000;

/** All platform integration statuses. */
export function useIntegrations() {
  return useQuery({
    queryKey: ["integrations"],
    queryFn: fetchIntegrations,
    staleTime: STALE_5_MIN,
  });
}

/** Single platform integration lookup (from cached list). */
export function useIntegration(id: string): PlatformIntegrationStatus | undefined {
  const { data } = useIntegrations();
  return data?.data.find((i) => i.id === id);
}

/** Boolean feature gate — is a named feature enabled by its integration being configured? */
export function useFeatureEnabled(featureName: string): boolean {
  const { data } = useIntegrations();
  if (!data) return false;
  return data.data.some((i) => i.configured && i.enabledFeatures.includes(featureName));
}

/** All provider credential specs (what users need to supply per provider). */
export function useProviderCredentialSpecs() {
  return useQuery({
    queryKey: ["integrations", "providers"],
    queryFn: fetchProviderCredentialSpecs,
    staleTime: STALE_5_MIN,
  });
}

/** Single provider's required credentials. */
export function useProviderCredentials(providerId: string | undefined) {
  return useQuery({
    queryKey: ["integrations", "providers", providerId],
    queryFn: () => fetchProviderCredentialSpec(providerId!),
    enabled: !!providerId,
    staleTime: STALE_5_MIN,
  });
}
