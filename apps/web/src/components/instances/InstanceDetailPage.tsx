import { useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/instances_.$id";
import { useInstance, useInstanceConfig } from "@/hooks/useInstances";
import { useInstanceExtensions } from "@/hooks/useMetrics";
import { StatusBadge } from "./StatusBadge";
import { MetricsGauge } from "./MetricsGauge";
import { LifecycleActions } from "./lifecycle";
import { InstanceDashboard } from "@/components/dashboard/instance";
import { LogAggregator } from "@/components/logs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Server,
  Clock,
  MapPin,
  Cpu,
  FileCode,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { formatUptime, formatRelativeTime } from "@/lib/utils";

export function InstanceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: instance, isLoading, isError } = useInstance(id);
  const { data: config } = useInstanceConfig(id);
  const { data: extData } = useInstanceExtensions(id);
  const [configExpanded, setConfigExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading instance...
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/instances" })}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Instances
        </Button>
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          Instance not found or failed to load.
        </div>
      </div>
    );
  }

  const hb = instance.lastHeartbeat;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/instances" })}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{instance.name}</h1>
            <StatusBadge status={instance.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {instance.provider}
            {instance.region ? ` / ${instance.region}` : ""}
          </p>
        </div>
        <LifecycleActions instance={instance} />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Provider</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold capitalize">{instance.provider}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Region</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{instance.region ?? "local"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {hb ? formatUptime(Number(hb.uptimeSeconds)) : "N/A"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Extensions</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const exts = extData?.extensions ?? [];
              const total = exts.length > 0 ? exts.length : instance.extensions.length;
              const healthyCount = exts.filter((e) => e.status === "healthy").length;
              const allHealthy = exts.length > 0 && healthyCount === exts.length;
              return (
                <div
                  className={`text-lg font-semibold ${allHealthy ? "text-emerald-500" : total > 0 ? "text-red-500" : ""}`}
                >
                  {total}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {hb && (
        <Card>
          <CardHeader>
            <CardTitle>Resource Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-3">
              <MetricsGauge label="CPU" value={hb.cpuPercent} />
              <MetricsGauge
                label="Memory"
                value={
                  Number(hb.memoryTotalBytes) > 0
                    ? (Number(hb.memoryUsedBytes) / Number(hb.memoryTotalBytes)) * 100
                    : 0
                }
              />
              <MetricsGauge
                label="Disk"
                value={
                  Number(hb.diskTotalBytes) > 0
                    ? (Number(hb.diskUsedBytes) / Number(hb.diskTotalBytes)) * 100
                    : 0
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historical metrics charts + process list */}
      <InstanceDashboard instanceId={instance.id} />

      {/* Log aggregation panel */}
      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <LogAggregator instanceId={instance.id} />
        </CardContent>
      </Card>

      {config && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none flex flex-row items-center gap-2"
            onClick={() => setConfigExpanded((v) => !v)}
          >
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium flex-1">Deployment Config</CardTitle>
            <span className="text-xs text-muted-foreground mr-2">
              {formatRelativeTime(config.updatedAt)}
            </span>
            {configExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          {configExpanded && (
            <CardContent>
              <pre className="text-xs font-mono bg-muted rounded-md p-4 overflow-x-auto whitespace-pre max-h-96 overflow-y-auto">
                {config.config}
              </pre>
            </CardContent>
          )}
        </Card>
      )}

      <div className="text-xs text-muted-foreground">
        Last updated: {formatRelativeTime(instance.updatedAt)}
      </div>
    </div>
  );
}
