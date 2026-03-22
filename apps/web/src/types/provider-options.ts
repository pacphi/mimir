// ─────────────────────────────────────────────────────────────────────────────
// Provider-specific option interfaces for the deployment wizard.
// These mirror the Sindri v3 schema at sindri/v3/schemas/sindri.schema.json.
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderId =
  | "fly"
  | "docker"
  | "devpod-aws"
  | "devpod-gcp"
  | "devpod-azure"
  | "devpod-digitalocean"
  | "e2b"
  | "runpod"
  | "northflank"
  | "kubernetes";

/** Map UI composite IDs to API-level provider names */
export type ApiProvider =
  | "fly"
  | "docker"
  | "devpod"
  | "e2b"
  | "runpod"
  | "northflank"
  | "kubernetes";

export function toApiProvider(id: ProviderId): ApiProvider {
  if (id.startsWith("devpod-")) return "devpod";
  return id as ApiProvider;
}

export function toDevpodBackend(id: ProviderId): string | undefined {
  if (!id.startsWith("devpod-")) return undefined;
  return id.replace("devpod-", "");
}

// ─── Provider option shapes (aligned with Sindri v3 schema) ─────────────────

export interface FlyOptions {
  autoStop?: boolean;
  autoStart?: boolean;
  cpuKind?: "shared" | "performance";
  sshPort?: number;
  org?: string;
  ha?: boolean;
}

export interface DockerOptions {
  docker_host?: string;
  network?: "bridge" | "host" | "none";
  restart?: "no" | "always" | "on-failure" | "unless-stopped";
  runtime?: "runc" | "sysbox-runc" | "auto";
  privileged?: boolean;
  ports?: string[];
  extraHosts?: string[];
  dind?: boolean | DindConfig;
}

export interface DindConfig {
  enabled?: boolean;
  mode?: "auto" | "sysbox" | "privileged" | "socket";
  storageDriver?: "auto" | "overlay2" | "fuse-overlayfs" | "vfs";
  storageSize?: string;
}

export interface DevpodAwsOptions {
  instanceType?: string;
  diskSize?: number;
  useSpot?: boolean;
  subnet?: string;
  securityGroup?: string;
}

export interface DevpodGcpOptions {
  project?: string;
  zone?: string;
  diskType?: "pd-standard" | "pd-ssd" | "pd-balanced";
}

export interface DevpodAzureOptions {
  subscription?: string;
  resourceGroup?: string;
  location?: string;
  vmSize?: string;
  diskSize?: number;
}

export interface DevpodDigitaloceanOptions {
  size?: string;
  diskSize?: number;
}

export interface E2bOptions {
  timeout?: number;
  autoPause?: boolean;
  autoResume?: boolean;
  internetAccess?: boolean;
  allowedDomains?: string[];
  blockedDomains?: string[];
  publicAccess?: boolean;
  metadata?: Record<string, string>;
  team?: string;
  buildOnDeploy?: boolean;
  templateAlias?: string;
  reuseTemplate?: boolean;
}

export interface RunpodOptions {
  gpuTypeId?: string;
  gpuCount?: number;
  containerDiskGb?: number;
  volumeSizeGb?: number;
  volumeMountPath?: string;
  cloudType?: "COMMUNITY" | "SECURE";
  startSsh?: boolean;
  exposePorts?: string[];
  spotBid?: number;
  cpuOnly?: boolean;
  cpuInstanceId?: string;
  templateId?: string;
}

export interface NorthflankOptions {
  projectName?: string;
  instances?: number;
  gpuType?: string;
  ports?: Array<{ port: number; protocol?: "TCP" | "UDP"; public?: boolean }>;
  healthCheck?: {
    type?: "http" | "tcp" | "command";
    path?: string;
    port?: number;
    command?: string[];
    initialDelaySeconds?: number;
    periodSeconds?: number;
    failureThreshold?: number;
  };
  autoScaling?: {
    enabled?: boolean;
    min?: number;
    max?: number;
    targetCpu?: number;
    targetMemory?: number;
  };
  registryCredentials?: string;
}

export interface KubernetesOptions {
  namespace?: string;
  storageClass?: string;
  context?: string;
  ingress?: {
    enabled?: boolean;
    hostname?: string;
  };
}

export type ProviderOptionsMap = {
  fly: FlyOptions;
  docker: DockerOptions;
  "devpod-aws": DevpodAwsOptions;
  "devpod-gcp": DevpodGcpOptions;
  "devpod-azure": DevpodAzureOptions;
  "devpod-digitalocean": DevpodDigitaloceanOptions;
  e2b: E2bOptions;
  runpod: RunpodOptions;
  northflank: NorthflankOptions;
  kubernetes: KubernetesOptions;
};

// ─── Provider metadata for card display ─────────────────────────────────────

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  description: string;
  icon: string;
}

export const PROVIDER_CATALOG: ProviderMeta[] = [
  {
    id: "devpod-aws",
    name: "AWS",
    description: "DevPod development environment on AWS",
    icon: "A",
  },
  {
    id: "devpod-azure",
    name: "Azure",
    description: "DevPod development environment on Azure",
    icon: "Z",
  },
  {
    id: "devpod-digitalocean",
    name: "DigitalOcean",
    description: "DevPod development environment on DigitalOcean",
    icon: "O",
  },
  {
    id: "docker",
    name: "Docker",
    description: "Docker deployment (local or remote host)",
    icon: "D",
  },
  { id: "e2b", name: "E2B", description: "E2B cloud sandbox", icon: "E" },
  { id: "fly", name: "Fly.io", description: "Fly.io cloud deployment", icon: "F" },
  {
    id: "devpod-gcp",
    name: "Google",
    description: "DevPod development environment on Google Cloud",
    icon: "G",
  },
  { id: "kubernetes", name: "Kubernetes", description: "Kubernetes cluster deployment", icon: "K" },
  {
    id: "northflank",
    name: "Northflank",
    description: "Northflank container platform deployment",
    icon: "N",
  },
  { id: "runpod", name: "RunPod", description: "RunPod GPU cloud deployment", icon: "R" },
];

/** Providers where region selection is not applicable, with a short explanation */
export const PROVIDERS_WITHOUT_REGION: Partial<Record<ProviderId, string>> = {
  e2b: "E2B manages sandbox infrastructure automatically. Region selection is only supported for Enterprise accounts with BYOC (Bring Your Own Cloud).",
  docker: "Docker deploys to a local or remote Docker daemon. Region selection is not applicable.",
  kubernetes:
    "Kubernetes targets your configured cluster context. Region is determined by your kubeconfig, not set here.",
};

/** Map devpod-{backend} → catalog provider for fetching compute/regions */
export function catalogProviderFor(id: ProviderId): string {
  switch (id) {
    case "devpod-aws":
      return "aws";
    case "devpod-gcp":
      return "gcp";
    case "devpod-azure":
      return "azure";
    case "devpod-digitalocean":
      return "digitalocean";
    default:
      return toApiProvider(id);
  }
}
