export type InstanceStatus =
  | "RUNNING"
  | "STOPPED"
  | "DEPLOYING"
  | "DESTROYING"
  | "DESTROYED"
  | "SUSPENDED"
  | "ERROR"
  | "UNKNOWN";

export interface Heartbeat {
  cpuPercent: number;
  memoryUsedBytes: string;
  memoryTotalBytes: string;
  diskUsedBytes: string;
  diskTotalBytes: string;
  uptimeSeconds: string;
  timestamp: string;
}

export interface Instance {
  id: string;
  name: string;
  provider: string;
  region: string | null;
  distro?: string;
  extensions: string[];
  configHash: string | null;
  sshEndpoint: string | null;
  status: InstanceStatus;
  createdAt: string;
  updatedAt: string;
  lastHeartbeat?: Heartbeat | null;
}

export interface InstanceListResponse {
  instances: Instance[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface InstanceFilters {
  provider?: string;
  region?: string;
  distro?: string;
  status?: InstanceStatus;
  search?: string;
}

export interface WebSocketMessage {
  type: "instance_update" | "heartbeat" | "connected" | "error";
  payload: unknown;
}

export interface InstanceUpdateMessage extends WebSocketMessage {
  type: "instance_update";
  payload: {
    instanceId: string;
    status: InstanceStatus;
    updatedAt: string;
  };
}

export interface HeartbeatMessage extends WebSocketMessage {
  type: "heartbeat";
  payload: Heartbeat & { instanceId: string };
}
