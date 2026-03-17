/**
 * Hook for reading and writing file content on a remote instance.
 * Used by the MonacoEditorPane component.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useFsWebSocket } from "./useFsWebSocket";

interface UseFileContentOptions {
  instanceId: string;
  sessionId: string;
  filePath: string | null;
  enabled: boolean;
}

export function useFileContent({
  instanceId,
  sessionId,
  filePath,
  enabled,
}: UseFileContentOptions) {
  const [content, setContent] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activePathRef = useRef<string | null>(null);

  const { sendFsMessage, connected } = useFsWebSocket({ instanceId, enabled });

  // Load file content when filePath changes
  useEffect(() => {
    if (!filePath || !connected || !enabled) {
      setContent(null);
      return;
    }

    activePathRef.current = filePath;
    setIsLoading(true);
    setError(null);

    sendFsMessage("fs:read", { sessionId, path: filePath }, (data) => {
      // Ignore response if the active file has changed
      if (activePathRef.current !== filePath) return;

      if (data.error) {
        setError(data.error as string);
        setContent(null);
      } else {
        const raw = data.content as string;
        const encoding = data.encoding as string;
        try {
          if (encoding === "utf8") {
            setContent(atob(raw));
          } else {
            setContent(`[Binary file — ${raw.length} bytes base64]`);
          }
          setError(null);
        } catch {
          setError("Failed to decode file content");
          setContent(null);
        }
      }
      setIsLoading(false);
    });
  }, [filePath, connected, enabled, sendFsMessage, sessionId]);

  const saveFile = useCallback(
    (newContent: string) => {
      if (!filePath || !connected) return;

      setIsSaving(true);
      setError(null);

      const encoded = btoa(newContent);
      sendFsMessage("fs:write", { sessionId, path: filePath, content: encoded }, (data) => {
        setIsSaving(false);
        if (data.error) {
          setError(data.error as string);
        }
      });
    },
    [filePath, connected, sendFsMessage, sessionId],
  );

  return { content, isLoading, isSaving, saveFile, error };
}
