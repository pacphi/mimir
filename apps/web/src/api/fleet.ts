import type { FleetStats, FleetDeploymentsResponse, FleetGeoResponse } from "@/types/fleet";
import { apiFetch } from "@/lib/api-fetch";

export const fleetApi = {
  getStats(): Promise<FleetStats> {
    return apiFetch<FleetStats>("/fleet/stats");
  },

  getGeo(): Promise<FleetGeoResponse> {
    return apiFetch<FleetGeoResponse>("/fleet/geo");
  },

  getDeployments(): Promise<FleetDeploymentsResponse> {
    return apiFetch<FleetDeploymentsResponse>("/fleet/deployments");
  },
};
