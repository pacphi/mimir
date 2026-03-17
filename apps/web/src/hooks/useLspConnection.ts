/**
 * Hook for managing an LSP WebSocket connection to a language server
 * running on a remote instance via the /ws/lsp/:instanceId bridge.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { fetchWsTicket } from "@/hooks/useWsTicket";

export type LspStatus = "disconnected" | "connecting" | "connected" | "error";

interface UseLspConnectionOptions {
  instanceId: string;
  languageId: string;
  rootUri: string;
  enabled: boolean;
}

export function useLspConnection({
  instanceId,
  languageId,
  rootUri,
  enabled,
}: UseLspConnectionOptions) {
  const [lspStatus, setLspStatus] = useState<LspStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setLspStatus("disconnected");
  }, []);

  useEffect(() => {
    if (!enabled || languageId === "plaintext") {
      disconnect();
      return;
    }

    let cancelled = false;

    async function connect() {
      setLspStatus("connecting");

      const ticket = await fetchWsTicket();
      if (!ticket || cancelled) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws/lsp/${instanceId}?languageId=${encodeURIComponent(languageId)}&ticket=${encodeURIComponent(ticket)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        setLspStatus("connected");
      };

      ws.onerror = () => {
        if (!cancelled) setLspStatus("error");
      };

      ws.onclose = () => {
        if (!cancelled) {
          setLspStatus("disconnected");
          wsRef.current = null;
        }
      };
    }

    void connect();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [enabled, instanceId, languageId, rootUri, disconnect]);

  return { lspStatus };
}
