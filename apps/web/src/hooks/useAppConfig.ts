import { useQuery } from "@tanstack/react-query";

export interface AppConfig {
  authBypass: boolean;
  nodeEnv: string;
  sindriDefaultImage: string;
  sindriImageRegistry: string;
  sindriImageVersion: string;
}

const DEFAULTS: AppConfig = {
  authBypass: false,
  nodeEnv: "development",
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
