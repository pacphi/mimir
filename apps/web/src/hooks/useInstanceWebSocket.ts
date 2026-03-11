import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { fetchWsTicket } from "@/hooks/useWsTicket";
import type { HeartbeatMessage, InstanceUpdateMessage, WebSocketMessage } from "@/types/instance";

const WS_BASE = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

export function useInstanceWebSocket() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.session);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 2000;

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let msg: WebSocketMessage;
      try {
        msg = JSON.parse(event.data as string) as WebSocketMessage;
      } catch {
        return;
      }

      if (msg.type === "instance_update") {
        const update = msg as InstanceUpdateMessage;
        // Update the specific instance in the cache
        queryClient.setQueryData<{
          instances: { id: string; status: string; updatedAt: string }[];
        }>(["instances"], (old) => {
          if (!old) return old;
          return {
            ...old,
            instances: old.instances.map((inst) =>
              inst.id === update.payload.instanceId
                ? { ...inst, status: update.payload.status, updatedAt: update.payload.updatedAt }
                : inst,
            ),
          };
        });
        // Also invalidate the individual instance query
        void queryClient.invalidateQueries({ queryKey: ["instances", update.payload.instanceId] });
      }

      if (msg.type === "heartbeat") {
        const hb = msg as HeartbeatMessage;
        // Update the cached heartbeat for the instance
        queryClient.setQueryData<{ instances: { id: string; lastHeartbeat: unknown }[] }>(
          ["instances"],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              instances: old.instances.map((inst) =>
                inst.id === hb.payload.instanceId ? { ...inst, lastHeartbeat: hb.payload } : inst,
              ),
            };
          },
        );
      }
    },
    [queryClient],
  );

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ticket = await fetchWsTicket();
    if (!ticket) return; // not authenticated — skip silently

    const ws = new WebSocket(`${WS_BASE}?ticket=${encodeURIComponent(ticket)}`);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      reconnectAttemptsRef.current = 0;
    });

    ws.addEventListener("message", handleMessage);

    ws.addEventListener("close", () => {
      wsRef.current = null;
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(() => {
          void connect();
        }, RECONNECT_DELAY_MS * reconnectAttemptsRef.current);
      }
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }, [handleMessage]);

  useEffect(() => {
    if (!isAuthenticated) return;

    void connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect, isAuthenticated]);
}
