import type { ComponentType } from "react";
import type { ProviderId } from "@/types/provider-options";
import { FlyOptions } from "./FlyOptions";
import { DockerOptions } from "./DockerOptions";
import { DevpodAwsOptions } from "./DevpodAwsOptions";
import { DevpodGcpOptions } from "./DevpodGcpOptions";
import { DevpodAzureOptions } from "./DevpodAzureOptions";
import { DevpodDigitaloceanOptions } from "./DevpodDigitaloceanOptions";
import { E2bOptions } from "./E2bOptions";
import { RunpodOptions } from "./RunpodOptions";
import { NorthflankOptions } from "./NorthflankOptions";
import { KubernetesOptions } from "./KubernetesOptions";

export interface ProviderOptionsProps {
  options: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  setOptions: (options: Record<string, unknown>) => void;
}

export const providerOptionsComponents: Partial<
  Record<ProviderId, ComponentType<ProviderOptionsProps>>
> = {
  fly: FlyOptions,
  docker: DockerOptions,
  "devpod-aws": DevpodAwsOptions,
  "devpod-gcp": DevpodGcpOptions,
  "devpod-azure": DevpodAzureOptions,
  "devpod-digitalocean": DevpodDigitaloceanOptions,
  e2b: E2bOptions,
  runpod: RunpodOptions,
  northflank: NorthflankOptions,
  kubernetes: KubernetesOptions,
};
