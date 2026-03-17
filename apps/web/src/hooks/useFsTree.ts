/**
 * Hook for managing a remote filesystem tree via WebSocket.
 * Used by the FileExplorer component to lazily load directory contents.
 */

import { useState, useCallback, useEffect } from "react";
import { useFsWebSocket } from "./useFsWebSocket";

export interface FsTreeEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
  modified?: string;
  children?: FsTreeEntry[];
}

interface UseFsTreeOptions {
  instanceId: string;
  sessionId: string;
  rootPath: string;
  enabled: boolean;
}

export function useFsTree({ instanceId, sessionId, rootPath, enabled }: UseFsTreeOptions) {
  const [tree, setTree] = useState<FsTreeEntry[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { sendFsMessage, connected } = useFsWebSocket({ instanceId, enabled });

  const requestList = useCallback(
    (dirPath: string) => {
      sendFsMessage("fs:list", { sessionId, path: dirPath }, (data) => {
        if (data.error) {
          setError(data.error as string);
          setIsLoading(false);
          return;
        }

        const entries = (data.entries as FsTreeEntry[]) ?? [];

        if (dirPath === rootPath) {
          // Root level — replace entire tree
          setTree(entries);
          setIsLoading(false);
        } else {
          // Subdirectory — insert children into tree
          setTree((prev) => insertChildren(prev, dirPath, entries));
        }
        setError(null);
      });
    },
    [sendFsMessage, sessionId, rootPath],
  );

  // Request root on connect
  useEffect(() => {
    if (connected && enabled) {
      setIsLoading(true);
      requestList(rootPath);
    }
  }, [connected, enabled, rootPath, requestList]);

  const toggleExpand = useCallback(
    (dirPath: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(dirPath)) {
          next.delete(dirPath);
        } else {
          next.add(dirPath);
          requestList(dirPath);
        }
        return next;
      });
    },
    [requestList],
  );

  const refresh = useCallback(() => {
    setIsLoading(true);
    setExpandedPaths(new Set());
    requestList(rootPath);
  }, [rootPath, requestList]);

  return { tree, expandedPaths, toggleExpand, refresh, isLoading, error };
}

/** Recursively insert children into the tree at the given path */
function insertChildren(
  tree: FsTreeEntry[],
  parentPath: string,
  children: FsTreeEntry[],
): FsTreeEntry[] {
  return tree.map((entry) => {
    if (entry.path === parentPath) {
      return { ...entry, children };
    }
    if (entry.children) {
      return { ...entry, children: insertChildren(entry.children, parentPath, children) };
    }
    return entry;
  });
}
