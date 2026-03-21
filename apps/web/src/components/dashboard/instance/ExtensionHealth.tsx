import { useRef, useState, useCallback, useEffect } from "react";
import { useInstanceExtensions } from "@/hooks/useMetrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  HelpCircle,
  Loader2,
  Puzzle,
  RefreshCw,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { ExtensionStatusEntry } from "@/lib/metricsApi";

interface ExtensionHealthProps {
  instanceId: string;
  className?: string;
}

function StatusIcon({ status }: { status: ExtensionStatusEntry["status"] }) {
  switch (status) {
    case "healthy":
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "degraded":
      return <AlertCircle className="h-4 w-4 text-amber-500" />;
    case "installing":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "stalled":
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusLabel(status: ExtensionStatusEntry["status"]): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "installing":
      return "Installing";
    case "stalled":
      return "Stalled";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

export function ExtensionHealth({ instanceId, className }: ExtensionHealthProps) {
  const { data, isLoading, isError, isFetching } = useInstanceExtensions(instanceId);
  const scrollRef = useRef<HTMLUListElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);

  useEffect(() => {
    updateScrollIndicators();
  }, [data, updateScrollIndicators]);

  const extensions = data?.extensions ?? [];
  const healthyCount = extensions.filter((e) => e.status === "healthy").length;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-muted-foreground" />
            Extension Health
          </CardTitle>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {isFetching && <RefreshCw className="h-3 w-3 animate-spin" />}
            {!isLoading && data && `${healthyCount}/${extensions.length} healthy`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Failed to load extension status
          </p>
        ) : extensions.length === 0 ? (
          <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
            <Puzzle className="h-8 w-8 opacity-40" />
            <p className="text-sm">No extensions installed</p>
          </div>
        ) : (
          <div className="relative">
            {canScrollUp && (
              <div className="absolute top-0 left-0 right-0 z-10 flex justify-center py-0.5 bg-gradient-to-b from-background to-transparent pointer-events-none">
                <ChevronUp className="h-3 w-3 text-muted-foreground animate-pulse" />
              </div>
            )}
            {canScrollDown && (
              <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center py-0.5 bg-gradient-to-t from-background to-transparent pointer-events-none">
                <ChevronDown className="h-3 w-3 text-muted-foreground animate-pulse" />
              </div>
            )}
            <ul
              ref={scrollRef}
              onScroll={updateScrollIndicators}
              className="overflow-y-auto max-h-[480px] space-y-1 px-4 pb-4"
              role="list"
              aria-label="Extension health status"
            >
              {extensions.map((ext) => (
                <li
                  key={ext.name}
                  className="flex items-center justify-between rounded-md px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusIcon status={ext.status} />
                    <span className="text-sm font-mono truncate" title={ext.name}>
                      {ext.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        ext.status === "healthy" && "text-emerald-600 dark:text-emerald-400",
                        ext.status === "degraded" && "text-amber-600 dark:text-amber-400",
                        ext.status === "installing" && "text-blue-600 dark:text-blue-400",
                        ext.status === "stalled" && "text-orange-600 dark:text-orange-400",
                        ext.status === "error" && "text-red-600 dark:text-red-400",
                        ext.status === "unknown" && "text-muted-foreground",
                      )}
                    >
                      {statusLabel(ext.status)}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {formatRelativeTime(ext.lastChecked)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
