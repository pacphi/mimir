import { apiFetch } from "@/lib/api-fetch";

export interface InstanceConfigResponse {
  instanceId: string;
  name: string;
  config: string;
  configHash: string | null;
  updatedAt: string;
}

export interface CloneInstanceRequest {
  name: string;
  provider?: string;
  region?: string;
}

export interface CloneInstanceResponse {
  id: string;
  name: string;
  provider: string;
  region: string | null;
  extensions: string[];
  configHash: string | null;
  status: string;
  clonedFrom: string;
  createdAt: string;
  updatedAt: string;
}

export interface RedeployInstanceRequest {
  config?: string;
  force?: boolean;
}

export interface RedeployInstanceResponse {
  id: string;
  name: string;
  status: string;
  message: string;
  updatedAt: string;
}

export const lifecycleApi = {
  getConfig(instanceId: string): Promise<InstanceConfigResponse> {
    return apiFetch<InstanceConfigResponse>(`/instances/${instanceId}/config`);
  },

  clone(instanceId: string, req: CloneInstanceRequest): Promise<CloneInstanceResponse> {
    return apiFetch<CloneInstanceResponse>(`/instances/${instanceId}/clone`, {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  redeploy(instanceId: string, req: RedeployInstanceRequest): Promise<RedeployInstanceResponse> {
    return apiFetch<RedeployInstanceResponse>(`/instances/${instanceId}/redeploy`, {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
};
