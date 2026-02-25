import type {
  CreateDeploymentRequest,
  CreateDeploymentResponse,
  Deployment,
  Provider,
  VmSize,
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

  getRegions(
    provider: string,
  ): Promise<{ regions: Array<{ id: string; name: string; location: string }> }> {
    return apiFetch(`/providers/${provider}/regions`);
  },

  getVmSizes(provider: string): Promise<{ vm_sizes: VmSize[] }> {
    return apiFetch(`/providers/${provider}/vm-sizes`);
  },
};

export function getDeploymentWebSocketUrl(deploymentId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws/deployments/${deploymentId}`;
}
