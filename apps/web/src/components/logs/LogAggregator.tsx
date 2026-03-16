import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { logsApi } from "@/api/logs";
import type { LogLevel, LogSource, LogFiltersState, LogEntry } from "@/types/log";
import { useLogSources, useLogFile } from "@/hooks/useMetrics";
import { useInstances } from "@/hooks/useInstances";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, RefreshCw, ChevronUp, FileText, Database } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type LogMode = "files" | "db";

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  INFO: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  WARN: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  ERROR: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const LOG_LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];
const LOG_SOURCES: LogSource[] = ["AGENT", "EXTENSION", "BUILD", "APP", "SYSTEM"];

const FILE_LINES_PER_PAGE = 500;
const AUTO_REFRESH_INTERVAL = 5_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect log level token in a raw line for color coding. */
function detectLineLevel(line: string): LogLevel | null {
  if (/\[ERROR\]/i.test(line)) return "ERROR";
  if (/\[WARN\]/i.test(line)) return "WARN";
  if (/\[INFO\]/i.test(line)) return "INFO";
  if (/\[DEBUG\]/i.test(line)) return "DEBUG";
  return null;
}

function lineColor(level: LogLevel | null): string {
  switch (level) {
    case "ERROR":
      return "text-red-400";
    case "WARN":
      return "text-yellow-400";
    case "INFO":
      return "text-blue-400";
    case "DEBUG":
      return "text-gray-500";
    default:
      return "text-gray-200";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ModeTabsProps {
  mode: LogMode;
  onChange: (m: LogMode) => void;
}

function ModeTabs({ mode, onChange }: ModeTabsProps) {
  return (
    <div className="inline-flex rounded-md border bg-muted p-0.5 text-xs">
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 rounded px-3 py-1 font-medium transition-colors",
          mode === "files"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onChange("files")}
      >
        <FileText className="h-3 w-3" />
        Container Files
      </button>
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 rounded px-3 py-1 font-medium transition-colors",
          mode === "db"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onChange("db")}
      >
        <Database className="h-3 w-3" />
        DB Logs
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Container Files Mode
// ---------------------------------------------------------------------------

interface ContainerFilesViewProps {
  instanceId: string;
}

function ContainerFilesView({ instanceId }: ContainerFilesViewProps) {
  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [offset, setOffset] = useState(1);

  const queryClient = useQueryClient();

  const { data: sourcesData, isLoading: sourcesLoading } = useLogSources(instanceId);

  // Auto-select first source when data loads
  useEffect(() => {
    if (sourcesData?.sources.length && !selectedPath) {
      setSelectedPath(sourcesData.sources[0].path);
    }
  }, [sourcesData, selectedPath]);

  const {
    data: fileData,
    isLoading: fileLoading,
    isFetching: fileFetching,
    refetch: refetchFile,
  } = useLogFile(instanceId, selectedPath, FILE_LINES_PER_PAGE, offset);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !selectedPath) return;
    const id = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["log-file", instanceId, selectedPath] });
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [autoRefresh, instanceId, selectedPath, queryClient]);

  const handleSourceChange = (path: string) => {
    setSelectedPath(path);
    setOffset(1);
  };

  const handleLoadMore = () => {
    if (fileData) {
      setOffset((prev) => prev + FILE_LINES_PER_PAGE);
    }
  };

  const totalLines = fileData?.totalLines ?? 0;
  const showingFrom = offset;
  const showingTo = Math.min(offset + FILE_LINES_PER_PAGE - 1, totalLines);
  const hasMore = totalLines > offset + FILE_LINES_PER_PAGE - 1;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={selectedPath ?? ""} onValueChange={handleSourceChange}>
          <SelectTrigger className="h-8 w-96 text-sm">
            <SelectValue placeholder={sourcesLoading ? "Loading..." : "Select log file"} />
          </SelectTrigger>
          <SelectContent>
            {sourcesData?.sources.map((s) => (
              <SelectItem key={s.path} value={s.path}>
                <span className="flex items-center gap-2">
                  {s.path}
                  <span className="text-muted-foreground text-[10px]">
                    ({formatBytes(s.sizeBytes)})
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          <span className="text-xs text-muted-foreground">Auto-refresh</span>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => void refetchFile()}
          disabled={fileFetching}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", fileFetching && "animate-spin")} />
        </Button>

        {autoRefresh && (
          <Badge variant="success" className="text-[10px] h-5">
            Live
          </Badge>
        )}
      </div>

      {/* Log viewer */}
      <div className="rounded-md border bg-[#0d1117] font-mono text-xs overflow-auto max-h-[400px]">
        {fileLoading && !fileData ? (
          <div className="flex items-center justify-center py-8 text-gray-400">Loading...</div>
        ) : !selectedPath ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            Select a log file to view
          </div>
        ) : fileData?.lines.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            Log file is empty
          </div>
        ) : (
          <div className="p-3">
            {hasMore && (
              <div className="flex justify-center pb-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={handleLoadMore}
                >
                  <ChevronUp className="h-3 w-3" />
                  Load more
                </Button>
              </div>
            )}
            {fileData?.lines.map((line, idx) => {
              const level = detectLineLevel(line);
              return (
                <div
                  key={`${offset}-${idx}`}
                  className={cn(
                    "leading-5 whitespace-pre-wrap break-all hover:bg-white/5 px-1 -mx-1 rounded",
                    lineColor(level),
                  )}
                >
                  {line}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {fileData && totalLines > 0 && (
        <div className="text-xs text-muted-foreground">
          Showing {showingFrom.toLocaleString()}-{showingTo.toLocaleString()} of{" "}
          {totalLines.toLocaleString()} lines
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DB Logs Mode (with SSE streaming)
// ---------------------------------------------------------------------------

interface DbLogsViewProps {
  instanceId?: string;
}

function DbLogsView({ instanceId }: DbLogsViewProps) {
  const [filters, setFilters] = useState<LogFiltersState>({});
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [sseEntries, setSseEntries] = useState<LogEntry[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshFlash, setRefreshFlash] = useState(false);

  // Fleet mode: load instances for name lookup and filtering
  const isFleetMode = !instanceId;
  const { data: instancesData } = useInstances({}, 1, 100);
  const instanceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (instancesData?.instances) {
      for (const inst of instancesData.instances) {
        map.set(inst.id, inst.name);
      }
    }
    return map;
  }, [instancesData]);

  const effectiveFilters = useMemo(() => {
    if (filters.instanceId) return { ...filters, instanceId: filters.instanceId };
    return filters;
  }, [filters]);

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["logs", instanceId, effectiveFilters, page],
    queryFn: () =>
      instanceId
        ? logsApi.listForInstance(instanceId, effectiveFilters, page)
        : logsApi.list(effectiveFilters, page),
    refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL : false,
  });

  // Track last updated time and flash on data changes
  useEffect(() => {
    if (dataUpdatedAt) {
      setLastUpdated(new Date(dataUpdatedAt));
      setRefreshFlash(true);
      const timer = setTimeout(() => setRefreshFlash(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [dataUpdatedAt]);

  // SSE streaming for real-time updates
  useEffect(() => {
    if (!instanceId) return;

    const streamUrl = logsApi.getStreamUrl(instanceId);
    let es: EventSource;
    try {
      es = new EventSource(streamUrl, { withCredentials: true });
    } catch {
      return;
    }
    eventSourceRef.current = es;

    es.onopen = () => setSseConnected(true);

    es.addEventListener("log", (event) => {
      try {
        const entry = JSON.parse(event.data) as LogEntry;
        setSseEntries((prev) => [entry, ...prev].slice(0, 100));
      } catch {
        // ignore malformed events
      }
    });

    // Also handle default message events
    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data) as LogEntry;
        if (entry.id && entry.message) {
          setSseEntries((prev) => [entry, ...prev].slice(0, 100));
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      setSseConnected(false);
      // EventSource will auto-reconnect; if it fails permanently we just stay disconnected
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setSseConnected(false);
    };
  }, [instanceId]);

  // Clear SSE entries when filters or page change so they don't blend confusingly
  useEffect(() => {
    setSseEntries([]);
  }, [filters, page]);

  const applySearch = () => {
    setFilters((f) => ({ ...f, search: searchInput || undefined }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setSearchInput("");
    setPage(1);
  };

  // Combine SSE entries (newest first) with DB-fetched entries
  const allLogs = [...sseEntries, ...(data?.logs ?? [])];
  // Deduplicate by id
  const seenIds = new Set<string>();
  const deduped = allLogs.filter((e) => {
    if (seenIds.has(e.id)) return false;
    seenIds.add(e.id);
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <Input
            placeholder="Search logs..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            className="flex-1 h-8 text-sm"
          />
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={applySearch}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Select
          value={filters.level?.[0] ?? "all"}
          onValueChange={(v) => {
            setFilters((f) => ({ ...f, level: v === "all" ? undefined : [v as LogLevel] }));
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-32 text-sm">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {LOG_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.source?.[0] ?? "all"}
          onValueChange={(v) => {
            setFilters((f) => ({ ...f, source: v === "all" ? undefined : [v as LogSource] }));
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {LOG_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFleetMode && instancesData?.instances && instancesData.instances.length > 0 && (
          <Select
            value={filters.instanceId ?? "all"}
            onValueChange={(v) => {
              setFilters((f) => ({ ...f, instanceId: v === "all" ? undefined : v }));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-48 text-sm">
              <SelectValue placeholder="Instance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All instances</SelectItem>
              {instancesData.instances.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button variant="outline" size="sm" className="h-8" onClick={clearFilters}>
          Clear
        </Button>

        <div className="flex items-center gap-1.5">
          <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          <span className="text-xs text-muted-foreground">Auto-refresh</span>
        </div>

        <Button
          variant="outline"
          size="icon"
          className={cn("h-8 w-8", refreshFlash && "ring-1 ring-emerald-500/50")}
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", (isFetching || refreshFlash) && "animate-spin")}
          />
        </Button>

        {(autoRefresh || sseConnected) && (
          <Badge variant="success" className="text-[10px] h-5">
            Live
          </Badge>
        )}
      </div>

      {/* Log entries */}
      <div className="rounded-md border bg-[#0d1117] font-mono text-xs overflow-auto max-h-[400px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">Loading...</div>
        ) : deduped.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-400">No logs found</div>
        ) : (
          <table className="w-full">
            <tbody>
              {deduped.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap w-[160px]">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  {isFleetMode && (
                    <td
                      className="px-2 py-1.5 text-emerald-400 whitespace-nowrap w-[120px] truncate max-w-[120px]"
                      title={instanceNameMap.get(entry.instanceId) ?? entry.instanceId}
                    >
                      {instanceNameMap.get(entry.instanceId) ?? entry.instanceId.slice(0, 12)}
                    </td>
                  )}
                  <td className="px-2 py-1.5 w-[60px]">
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                        LEVEL_COLORS[entry.level],
                      )}
                    >
                      {entry.level}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap w-[90px]">
                    {entry.source}
                  </td>
                  <td className="px-2 py-1.5 text-gray-200 break-all">{entry.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination + last updated */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {data && data.pagination.total > 0
            ? `Page ${data.pagination.page} of ${data.pagination.totalPages} (${data.pagination.total} total)`
            : "\u00A0"}
          {lastUpdated && (
            <span className="ml-3 text-gray-500">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
        </span>
        {data && data.pagination.totalPages > 1 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page === data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main LogAggregator
// ---------------------------------------------------------------------------

interface LogAggregatorProps {
  instanceId?: string;
}

export function LogAggregator({ instanceId }: LogAggregatorProps) {
  const [mode, setMode] = useState<LogMode>("files");

  return (
    <div className="space-y-3">
      {/* Header with mode tabs */}
      <div className="flex items-center justify-between">
        <ModeTabs mode={mode} onChange={setMode} />
      </div>

      {/* Mode content */}
      {mode === "files" ? (
        instanceId ? (
          <ContainerFilesView instanceId={instanceId} />
        ) : (
          <div className="rounded-md border bg-[#0d1117] font-mono text-xs">
            <div className="flex items-center justify-center py-8 text-gray-400">
              No instance selected. Connect to an instance to view container log files.
            </div>
          </div>
        )
      ) : (
        <DbLogsView instanceId={instanceId} />
      )}
    </div>
  );
}
