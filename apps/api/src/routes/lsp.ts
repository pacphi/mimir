/**
 * LSP Bridge — WebSocket upgrade at /ws/lsp/:instanceId
 *
 * Spawns the appropriate language server inside a Docker container via
 * `docker exec` and relays JSON-RPC messages bidirectionally between
 * the browser (monaco-languageclient) and the language server process.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import pty from "node-pty";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { authenticateUpgrade } from "../websocket/auth.js";
import { LANGUAGE_SERVERS } from "../lib/lsp-catalog.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";

/** Resolve the docker binary — same lookup as gateway.ts */
function resolveDockerBin(): string {
  for (const p of ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "/usr/bin/docker"]) {
    if (existsSync(p)) return p;
  }
  try {
    return execFileSync("/usr/bin/which", ["docker"], { encoding: "utf-8" }).trim();
  } catch {
    return "docker";
  }
}

const dockerBin = resolveDockerBin();
const LSP_IDLE_TIMEOUT_MS = parseInt(process.env.LSP_IDLE_TIMEOUT_MS ?? "1800000", 10); // 30 min

export function attachLspBridge(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const pathname = (req.url ?? "").split("?")[0];
    const match = /^\/ws\/lsp\/([^/]+)$/.exec(pathname);
    if (!match) return; // Not an LSP route — let other handlers deal with it

    const instanceId = match[1];

    void authenticateUpgrade(req)
      .then(async (_principal) => {
        // Look up instance to get container name
        const instance = await db.instance.findUnique({
          where: { id: instanceId },
          select: { name: true, provider: true },
        });

        if (!instance || instance.provider !== "docker") {
          socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
          socket.destroy();
          return;
        }

        const url = new URL(req.url!, `http://${req.headers.host}`);
        const languageId = url.searchParams.get("languageId") ?? "plaintext";

        wss.handleUpgrade(req, socket, head, (ws) => {
          handleLspConnection(ws, instanceId, instance.name, languageId);
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Unauthorized";
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        logger.warn({ message, instanceId }, "LSP bridge: auth rejected");
      });
  });
}

function handleLspConnection(
  ws: WebSocket,
  instanceId: string,
  containerName: string,
  languageId: string,
): void {
  const serverDef = LANGUAGE_SERVERS[languageId];
  if (!serverDef) {
    ws.close(4004, `No language server configured for: ${languageId}`);
    return;
  }

  logger.info({ instanceId, containerName, languageId }, "LSP bridge: spawning language server");

  // Spawn the LS process inside the Docker container
  const ls = pty.spawn(
    dockerBin,
    [
      "exec",
      "-i",
      "-u",
      "developer",
      "-w",
      serverDef.cwd ?? "/alt/home/developer",
      containerName,
      serverDef.command,
      ...serverDef.args,
    ],
    {
      name: "xterm-256color",
      cols: 220,
      rows: 50,
      env: { ...process.env, TERM: "xterm-256color", ...serverDef.env },
    },
  );

  let idleTimer = resetIdleTimer();

  // PTY → browser (LS stdout → WS)
  ls.onData((data) => {
    idleTimer = resetIdleTimer(idleTimer);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  ls.onExit(({ exitCode }) => {
    logger.info({ instanceId, languageId, exitCode }, "LSP bridge: LS process exited");
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "Language server exited");
    }
  });

  // Browser → PTY (WS → LS stdin)
  ws.on("message", (raw) => {
    idleTimer = resetIdleTimer(idleTimer);
    const str = Buffer.isBuffer(raw) ? raw.toString("utf-8") : String(raw);
    ls.write(str);
  });

  ws.on("close", () => {
    clearTimeout(idleTimer);
    ls.kill();
    logger.info({ instanceId, languageId }, "LSP bridge: connection closed");
  });

  ws.on("error", (err) => {
    logger.warn({ err, instanceId, languageId }, "LSP bridge: WebSocket error");
  });

  function resetIdleTimer(prev?: ReturnType<typeof setTimeout>) {
    if (prev) clearTimeout(prev);
    return setTimeout(() => {
      logger.info({ instanceId, languageId }, "LSP bridge: idle timeout");
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Idle timeout");
      }
    }, LSP_IDLE_TIMEOUT_MS);
  }
}
