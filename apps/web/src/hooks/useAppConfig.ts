import { useQuery } from "@tanstack/react-query";

export interface AppConfig {
  authBypass: boolean;
  nodeEnv: string;
  sindriDefaultImage: string;
  sindriImageRegistry: string;
  sindriImageVersion: string;
  editorFsRoot: string;
  sindriSupportedDistros: string[];
  sindriDefaultDistro: string;
}

const DEFAULTS: AppConfig = {
  authBypass: false,
  nodeEnv: "development",
  sindriDefaultImage: "sindri:v3-ubuntu-dev",
  sindriImageRegistry: "ghcr.io/pacphi/sindri",
  sindriImageVersion: "latest",
  editorFsRoot: "/alt/home/developer/workspace",
  sindriSupportedDistros: ["ubuntu", "fedora", "opensuse"],
  sindriDefaultDistro: "ubuntu",
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
