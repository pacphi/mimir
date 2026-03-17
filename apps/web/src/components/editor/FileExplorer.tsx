import {
  ChevronRight,
  ChevronDown,
  FileIcon,
  FolderIcon,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { useFsTree, type FsTreeEntry } from "@/hooks/useFsTree";
import { cn } from "@/lib/utils";

interface FileExplorerProps {
  instanceId: string;
  sessionId: string;
  cwd: string;
  activeFilePath: string | null;
  onFileOpen: (path: string) => void;
  theme: "dark" | "light";
}

export function FileExplorer({
  instanceId,
  sessionId,
  cwd,
  activeFilePath,
  onFileOpen,
}: FileExplorerProps) {
  const { tree, expandedPaths, toggleExpand, refresh, isLoading, error } = useFsTree({
    instanceId,
    sessionId,
    rootPath: cwd,
    enabled: true,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return <div className="p-2 text-xs text-red-400">{error}</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-background font-mono text-xs">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <button
          type="button"
          onClick={refresh}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      {tree.map((entry) => (
        <FsTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          expandedPaths={expandedPaths}
          activeFilePath={activeFilePath}
          onToggle={toggleExpand}
          onFileOpen={onFileOpen}
        />
      ))}
    </div>
  );
}

function FsTreeNode({
  entry,
  depth,
  expandedPaths,
  activeFilePath,
  onToggle,
  onFileOpen,
}: {
  entry: FsTreeEntry;
  depth: number;
  expandedPaths: Set<string>;
  activeFilePath: string | null;
  onToggle: (path: string) => void;
  onFileOpen: (path: string) => void;
}) {
  const isExpanded = expandedPaths.has(entry.path);
  const isActive = entry.path === activeFilePath;
  const isDir = entry.type === "directory";

  return (
    <>
      <button
        type="button"
        onClick={() => (isDir ? onToggle(entry.path) : onFileOpen(entry.path))}
        className={cn(
          "flex w-full items-center gap-1 px-2 py-0.5 text-left hover:bg-accent",
          isActive && "bg-primary/10 text-primary",
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {isDir ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-3 w-3 shrink-0 text-yellow-500" />
            ) : (
              <FolderIcon className="h-3 w-3 shrink-0 text-yellow-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileIcon className="h-3 w-3 shrink-0 text-blue-400" />
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {isDir &&
        isExpanded &&
        entry.children?.map((child) => (
          <FsTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            expandedPaths={expandedPaths}
            activeFilePath={activeFilePath}
            onToggle={onToggle}
            onFileOpen={onFileOpen}
          />
        ))}
    </>
  );
}
