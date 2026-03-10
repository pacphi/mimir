import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDeploymentWebSocketUrl, deploymentsApi } from "@/api/deployments";
import type { DeploymentProgressEvent, DeploymentStatus } from "@/types/deployment";

interface ProgressLogEntry {
  timestamp: Date;
  message: string;
  type: "info" | "error" | "success";
}

interface DeploymentProgressProps {
  deploymentId: string;
  onComplete: (instanceId: string) => void;
  onError: (message: string) => void;
  onCancel: () => void;
  onBackToWizard?: () => void;
  onRetry?: () => void;
}

const STATUS_LABELS: Record<DeploymentStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "Deploying",
  SUCCEEDED: "Succeeded",
  FAILED: "Deployment failed",
  CANCELLED: "Cancelled",
};

export function DeploymentProgress({
  deploymentId,
  onComplete,
  onError,
  onCancel,
  onBackToWizard,
  onRetry,
}: DeploymentProgressProps) {
  const [status, setStatus] = useState<DeploymentStatus>("PENDING");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<ProgressLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const finalizedRef = useRef(false);
  // Stable refs so the WebSocket effect doesn't re-run when callbacks change
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const addLog = useCallback((message: string, type: ProgressLogEntry["type"] = "info") => {
    setLogs((prev) => [...prev, { timestamp: new Date(), message, type }]);
  }, []);

  const handleFinalStatus = useCallback(
    (data: { status?: string; instance_id?: string; message?: string; type?: string }) => {
      if (finalizedRef.current) return;

      if (data.status === "SUCCEEDED" && data.instance_id) {
        finalizedRef.current = true;
        addLog(data.message ?? "Instance is online and ready", "success");
        setProgress(100);
        setStatus("SUCCEEDED");
        onCompleteRef.current(data.instance_id);
      } else if (data.status === "FAILED" || data.type === "error") {
        finalizedRef.current = true;
        addLog(data.message ?? "Deployment failed", "error");
        setStatus("FAILED");
        onErrorRef.current(data.message ?? "Deployment failed");
      }
    },
    [addLog],
  );

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── WebSocket connection with reconnect ──────────────────────────────────
  useEffect(() => {
    let intentionalClose = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 3;

    function connect() {
      if (intentionalClose || finalizedRef.current) return;
      const url = getDeploymentWebSocketUrl(deploymentId);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setConnected(true);
        reconnectAttempts = 0;
        addLog("Connected to deployment stream");
      });

      ws.addEventListener("message", (event: MessageEvent) => {
        let data: DeploymentProgressEvent;
        try {
          data = JSON.parse(event.data as string) as DeploymentProgressEvent;
        } catch {
          addLog(`Received: ${event.data as string}`);
          return;
        }

        addLog(data.message, data.type === "error" ? "error" : "info");

        if (data.status) {
          setStatus(data.status as DeploymentStatus);
        }
        if (data.progress_percent !== undefined) {
          setProgress(data.progress_percent);
        }

        handleFinalStatus(data);
      });

      ws.addEventListener("close", () => {
        if (intentionalClose || finalizedRef.current) return;
        setConnected(false);
        if (reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          reconnectTimer = setTimeout(connect, 2000 * reconnectAttempts);
        }
      });

      ws.addEventListener("error", () => {
        if (intentionalClose || finalizedRef.current) return;
        ws.close();
      });
    }

    connect();

    return () => {
      intentionalClose = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [deploymentId, addLog, handleFinalStatus]);

  // ── REST polling fallback ────────────────────────────────────────────────
  // Polls the deployment status every 3s as a fallback when WS is unreliable.
  // Stops when a final status is reached.
  useEffect(() => {
    const poll = setInterval(async () => {
      if (finalizedRef.current) {
        clearInterval(poll);
        return;
      }

      try {
        const deployment = await deploymentsApi.get(deploymentId);
        if (!deployment) return;

        const depStatus = deployment.status as DeploymentStatus;

        // Update progress bar for intermediate states
        if (depStatus === "IN_PROGRESS" && status === "PENDING") {
          setStatus("IN_PROGRESS");
          setProgress(40);
          addLog("Deployment in progress...");
        }

        if (depStatus === "SUCCEEDED" && deployment.instance_id) {
          handleFinalStatus({
            status: "SUCCEEDED",
            instance_id: deployment.instance_id,
            message: "Instance is online and ready",
          });
        } else if (depStatus === "FAILED") {
          handleFinalStatus({
            status: "FAILED",
            type: "error",
            message: deployment.error ?? "Deployment failed",
          });
        }
      } catch {
        // Polling failure is not critical — WS or next poll will catch up
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [deploymentId, status, addLog, handleFinalStatus]);

  const isFinal = status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Deployment Status</CardTitle>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block w-2 h-2 rounded-full",
                  connected ? "bg-green-500 animate-pulse" : "bg-muted-foreground",
                )}
              />
              <span className="text-xs text-muted-foreground">
                {connected ? "Live" : "Polling"}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span
              className={cn(
                "font-medium",
                status === "SUCCEEDED" && "text-green-600",
                status === "FAILED" && "text-destructive",
                status === "CANCELLED" && "text-muted-foreground",
              )}
            >
              {STATUS_LABELS[status]}
            </span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>

          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-500",
                status === "FAILED" ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-xs text-muted-foreground">ID: {deploymentId}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Deployment Logs</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="bg-black rounded-md p-3 h-64 overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-muted-foreground">Waiting for events...</p>
            ) : (
              logs.map((entry, index) => (
                <div key={index} className="flex gap-2 leading-5">
                  <span className="text-muted-foreground shrink-0">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                  <span
                    className={cn(
                      "whitespace-pre-wrap break-all",
                      entry.type === "error" && "text-red-400",
                      entry.type === "success" && "text-green-400",
                      entry.type === "info" && "text-gray-300",
                    )}
                  >
                    {entry.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </CardContent>
      </Card>

      {!isFinal && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel Deployment
          </Button>
        </div>
      )}

      {status === "FAILED" && (
        <div className="flex justify-end gap-3">
          {onBackToWizard && (
            <Button variant="outline" onClick={onBackToWizard}>
              Back to Configuration
            </Button>
          )}
          {onRetry && <Button onClick={onRetry}>Retry Deployment</Button>}
        </div>
      )}
    </div>
  );
}
