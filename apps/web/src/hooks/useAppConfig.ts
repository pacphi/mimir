import { useQuery } from "@tanstack/react-query";

export interface AppConfig {
  authBypass: boolean;
  sindriDefaultImage: string;
  sindriImageRegistry: string;
  sindriImageVersion: string;
}

const DEFAULTS: AppConfig = {
  authBypass: false,
  sindriDefaultImage: "sindri:latest",
  sindriImageRegistry: "ghcr.io/pacphi/sindri",
  sindriImageVersion: "latest",
};

export function useAppConfig() {
  return useQuery({
    queryKey: ["app-config"],
    queryFn: async () => {
      const res = await fetch("/api/config");
      if (!res.ok) return DEFAULTS;
      return res.json() as Promise<AppConfig>;
    },
    staleTime: Infinity,
  });
}
