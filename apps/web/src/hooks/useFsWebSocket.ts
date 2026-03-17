/**
 * WebSocket hook for filesystem operations via the main gateway.
 * Shares the same gateway WS endpoint (/ws) but targets the "filesystem" channel.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { fetchWsTicket } from "@/hooks/useWsTicket";

type FsMessageHandler = (data: Record<string, unknown>) => void;

interface UseFsWebSocketOptions {
  instanceId: string;
  enabled: boolean;
}

export function useFsWebSocket({ instanceId, enabled }: UseFsWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, FsMessageHandler>>(new Map());
  const [connected, setConnected] = useState(false);
  // Generation counter to prevent stale WS callbacks from affecting state
  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled || !instanceId) return;

    const gen = ++generationRef.current;
    const handlers = handlersRef.current;
    let ws: WebSocket | null = null;

    async function connect() {
      const ticket = await fetchWsTicket();
      if (!ticket || gen !== generationRef.current) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws?ticket=${encodeURIComponent(ticket)}`;

      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (gen !== generationRef.current) {
          ws?.close();
          return;
        }
        setConnected(true);
        // Subscribe to this instance's events
        ws!.send(
          JSON.stringify({
            protocolVersion: "1.0",
            channel: "system",
            type: "subscribe",
            ts: Date.now(),
            data: { instanceId },
          }),
        );
      };

      ws.onmessage = (event) => {
        if (gen !== generationRef.current) return;
        try {
          const envelope = JSON.parse(event.data as string) as {
            channel?: string;
            type?: string;
            data?: Record<string, unknown>;
          };
          if (envelope.channel === "filesystem" && envelope.data) {
            const requestId = envelope.data.requestId as string | undefined;
            if (requestId) {
              const handler = handlers.get(requestId);
              if (handler) {
                handler(envelope.data);
                handlers.delete(requestId);
              }
            }
          }
        } catch {
          // Ignore non-JSON or non-fs messages
        }
      };

      ws.onerror = () => {
        if (gen === generationRef.current) setConnected(false);
      };

      ws.onclose = () => {
        if (gen === generationRef.current) {
          setConnected(false);
          wsRef.current = null;
        }
      };
    }

    void connect();

    return () => {
      // Close the old WS; the next effect run increments generationRef,
      // which invalidates any in-flight callbacks from this generation.
      ws?.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      setConnected(false);
      handlers.clear();
    };
  }, [enabled, instanceId]);

  const sendFsMessage = useCallback(
    (type: string, data: Record<string, unknown>, onResponse?: FsMessageHandler) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const requestId = (data.requestId as string) ?? crypto.randomUUID();
      if (onResponse) {
        handlersRef.current.set(requestId, onResponse);
      }

      wsRef.current.send(
        JSON.stringify({
          protocolVersion: "1.0",
          channel: "filesystem",
          type,
          instanceId,
          ts: Date.now(),
          data: { ...data, requestId },
        }),
      );

      return requestId;
    },
    [instanceId],
  );

  return { sendFsMessage, connected };
}
