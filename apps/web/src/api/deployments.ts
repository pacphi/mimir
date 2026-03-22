import type {
  ComputeCatalogResponse,
  CostEstimate,
  CreateDeploymentRequest,
  CreateDeploymentResponse,
  Deployment,
  Provider,
} from "@/types/deployment";
import { apiFetch } from "@/lib/api-fetch";

export const deploymentsApi = {
  create(req: CreateDeploymentRequest): Promise<CreateDeploymentResponse> {
    return apiFetch<CreateDeploymentResponse>("/deployments", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  get(id: string): Promise<Deployment> {
    return apiFetch<Deployment>(`/deployments/${id}`);
  },
};

export const providersApi = {
  list(): Promise<Provider[]> {
    return apiFetch<Provider[]>("/providers");
  },

  getAvailability(): Promise<{
    availability: Record<string, { available: boolean; reason?: string }>;
  }> {
    return apiFetch("/providers/availability");
  },

  getRegions(
    provider: string,
  ): Promise<{ regions: Array<{ id: string; name: string; location: string }> }> {
    return apiFetch(`/providers/${provider}/regions`);
  },

  getComputeCatalog(provider: string, region?: string): Promise<ComputeCatalogResponse> {
    const params = region ? `?region=${encodeURIComponent(region)}` : "";
    return apiFetch(`/providers/${provider}/compute-catalog${params}`);
  },

  estimateCost(
    provider: string,
    sizeId: string,
    diskGb?: number,
    egressGb?: number,
  ): Promise<CostEstimate> {
    const params = new URLSearchParams({ size_id: sizeId });
    if (diskGb != null) params.set("disk_gb", String(diskGb));
    if (egressGb != null) params.set("egress_gb", String(egressGb));
    return apiFetch(`/providers/${provider}/compute-catalog/estimate?${params}`);
  },
};

export const registryApi = {
  getCliStatus(): Promise<{ available: boolean; message?: string }> {
    return apiFetch("/registry/cli-status");
  },
};

export function getDeploymentWebSocketUrl(deploymentId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws/deployments/${deploymentId}`;
}
