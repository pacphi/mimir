import { Server, MapPin, Puzzle, Clock, Cpu, HardDrive, MemoryStick } from "lucide-react";
import type { Instance } from "@/types/instance";
import { StatusBadge } from "./StatusBadge";
import { MetricsGauge } from "./MetricsGauge";
import { formatBytes, formatRelativeTime, formatUptime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const DISTRO_DISPLAY: Record<string, string> = {
  ubuntu: "Ubuntu",
  fedora: "Fedora",
  opensuse: "openSUSE",
};

interface InstanceCardProps {
  instance: Instance;
  className?: string;
  onClick?: (instance: Instance) => void;
}

export function InstanceCard({ instance, className, onClick }: InstanceCardProps) {
  const hb = instance.lastHeartbeat;
  const memoryPercent = hb
    ? (Number(hb.memoryUsedBytes) / Number(hb.memoryTotalBytes)) * 100
    : null;
  const diskPercent = hb ? (Number(hb.diskUsedBytes) / Number(hb.diskTotalBytes)) * 100 : null;

  return (
    <article
      className={cn(
        "group relative rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-all",
        onClick && "cursor-pointer hover:border-primary/50 hover:shadow-md",
        className,
      )}
      onClick={() => onClick?.(instance)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(instance);
              }
            }
          : undefined
      }
      aria-label={`Instance ${instance.name}, status: ${instance.status}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-semibold text-sm">{instance.name}</span>
        </div>
        <StatusBadge status={instance.status} />
      </div>

      {/* Metadata */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 capitalize">
          <Server className="h-3 w-3" />
          {instance.provider}
        </span>
        {instance.distro && (
          <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
            {DISTRO_DISPLAY[instance.distro] ??
              instance.distro.charAt(0).toUpperCase() + instance.distro.slice(1)}
          </span>
        )}
        {instance.region && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {instance.region}
          </span>
        )}
        {instance.extensions.length > 0 && (
          <span className="flex items-center gap-1">
            <Puzzle className="h-3 w-3" />
            {instance.extensions.length} ext
          </span>
        )}
        {hb && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            up {formatUptime(Number(hb.uptimeSeconds))}
          </span>
        )}
      </div>

      {/* Metrics */}
      {hb && instance.status === "RUNNING" && (
        <div className="mt-3 space-y-1.5">
          <MetricsGauge label="CPU" value={hb.cpuPercent} size="sm" />
          {memoryPercent !== null && (
            <MetricsGauge
              label={`RAM ${formatBytes(Number(hb.memoryUsedBytes))} / ${formatBytes(Number(hb.memoryTotalBytes))}`}
              value={memoryPercent}
              size="sm"
            />
          )}
          {diskPercent !== null && (
            <MetricsGauge
              label={`Disk ${formatBytes(Number(hb.diskUsedBytes))} / ${formatBytes(Number(hb.diskTotalBytes))}`}
              value={diskPercent}
              size="sm"
            />
          )}
        </div>
      )}

      {/* No metrics placeholder */}
      {!hb && instance.status === "RUNNING" && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Cpu className="h-3 w-3" />
          <MemoryStick className="h-3 w-3" />
          <HardDrive className="h-3 w-3" />
          <span>Waiting for metrics...</span>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Updated {formatRelativeTime(instance.updatedAt)}</span>
        {hb && <span>Last heartbeat {formatRelativeTime(hb.timestamp)}</span>}
      </div>
    </article>
  );
}
