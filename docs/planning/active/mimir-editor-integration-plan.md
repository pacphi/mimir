# Mimir Shell IDE Integration: Monaco Editor + LSP

### Technical Implementation Plan

**Version:** 1.0  
**Date:** 2026-03-16  
**Scope:** `apps/web` · `apps/api` · `packages/shared` · `packages/protocol`

---

## 1. Executive Summary

Mimir already has the three core dependencies needed for a full in-browser IDE experience:

| Dependency                       | Location                         | Status         |
| -------------------------------- | -------------------------------- | -------------- |
| `@monaco-editor/react` `^4.7.0`  | `apps/web/package.json`          | ✅ Installed   |
| `monaco-editor` `^0.55.1`        | `apps/web/package.json`          | ✅ Installed   |
| `node-pty` `^1.1.0`              | `apps/api/package.json`          | ✅ Installed   |
| `@xterm/xterm` `^6.0.0` + addons | `apps/web/package.json`          | ✅ Installed   |
| WebSocket gateway (ticket auth)  | `apps/api/src/agents/gateway.ts` | ✅ Operational |

This plan wires these capabilities together. **No new runtime dependencies are strictly required** for the editor itself — the primary additions are `monaco-languageclient` and `vscode-ws-jsonrpc` for LSP, which are lightweight bridges over the existing WS channel.

The outcome is a **split-pane Shell IDE** within the Commands → Shells tab: users interact with a live PTY terminal on one side while viewing and editing files from the same instance's filesystem on the other, with full LSP-powered intelligence (completions, diagnostics, hover, go-to-definition) for the languages detected on the instance.

---

## 2. Current State Analysis

### 2.1 Shells Tab Architecture (as-built)

```
Commands Page
└── ShellsTab                       (apps/web/src/components/commands/ShellsTab.tsx)
    ├── InstanceSelector            — pick target instance
    ├── [Open Shell] button         — POST /api/v1/instances/:id/terminal
    └── ShellCarousel               (apps/web/src/components/commands/ShellCarousel.tsx)
        ├── Sortable pill strip     — @dnd-kit drag-to-reorder
        ├── ChevronLeft/Right nav   — carousel navigation
        └── Terminal viewport       — absolute-positioned stack
            └── Terminal[n]         (apps/web/src/components/terminal/Terminal.tsx)
                └── @xterm/xterm    — PTY output renderer
                    └── useTerminalWebSocket hook
                        └── WS /ws  — gateway.ts → node-pty
```

### 2.2 WebSocket Message Flow (as-built)

```
Browser                API Gateway                   Agent (Draupnir / node-pty)
  |                        |                                   |
  |── POST /terminal ──────>|                                   |
  |<── { sessionId, wsUrl }─|                                   |
  |                        |                                   |
  |── WS connect ──────────>|                                   |
  |── terminal:create ─────>|──── Redis pub/sub ────────────────>|
  |                        |                                   |── spawn PTY
  |                        |<─── terminal:created ─────────────|
  |<── terminal:created ───|                                   |
  |── terminal:data ───────>|──── forward ──────────────────────>|── write to PTY
  |<── terminal:data ───────|<─── read from PTY ─────────────── |
```

### 2.3 Key Extension Points Identified

| Area             | File                                    | What needs to change                    |
| ---------------- | --------------------------------------- | --------------------------------------- |
| `ShellCard` type | `packages/shared/src/types/terminal.ts` | Add editor state fields                 |
| Terminal store   | `apps/web/src/stores/terminal.ts`       | Track open files per card               |
| `ShellCarousel`  | `commands/ShellCarousel.tsx`            | Render split pane, toggle button        |
| WS protocol      | `packages/protocol/src/index.ts`        | `fs:*` and `lsp:*` message types        |
| API gateway      | `apps/api/src/agents/gateway.ts`        | Handle `fs:read`, `fs:write`, `fs:list` |
| API routes       | `apps/api/src/routes/`                  | New `/lsp/:instanceId` WS upgrade route |
| Prisma schema    | `apps/api/prisma/schema.prisma`         | `EditorSession` model                   |

---

## 3. Target Architecture

### 3.1 Split-Pane Shell IDE Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Commands → Shells Tab                                           │
│                                                                  │
│  [Instance Selector ▼]  [Open Shell]                             │
│                                                                  │
│  ┌─── Shell: my-dev-box ── 1/3 ──────── [≡ Files] [⊞ Split] [×]─┐│
│  │ ┌────────────────────┬────────────────────────────────────┐ ││
│  │ │  File Explorer     │  Monaco Editor                     │ ││
│  │ │                    │                                    │ ││
│  │ │  📁 /workspace     │  fn main() {                       │ ││
│  │ │   ├─ src/          │    println!("Hello, world!");      │ ││
│  │ │   │  └─ main.rs ●  │  }                                 │ ││
│  │ │   ├─ Cargo.toml    │                                    │ ││
│  │ │   └─ .env          │  [LSP: rust-analyzer connected]    │ ││
│  │ │                    │                                    │ ││
│  │ ├────────────────────┴────────────────────────────────────┤ ││
│  │ │  xterm.js Terminal (node-pty)                          │ ││
│  │ │  $ cargo build                                         │ ││
│  │ │  Compiling hello-world v0.1.0                          │ ││
│  │ └────────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  [● my-dev-box]  [○ staging-1]  [○ prod-mirror]                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Revised Message Flow

```
Browser                 API Gateway                       Agent
  │                          │                              │
  │── fs:list { path } ─────>│── forward via Redis ─────────>│
  │<── fs:listed { entries } ─│<── agent reads FS ───────────│
  │── fs:read { path } ──────>│── forward ───────────────────>│
  │<── fs:read:result ─────────│<── agent cat file ───────────│
  │── fs:write { path, data }─>│── forward ───────────────────>│
  │<── fs:write:ack ───────────│<── agent writes file ────────│
  │                          │                              │
  │── WS /ws/lsp/:instanceId >│                              │
  │   JSON-RPC (LSP) ─────────>│── spawn language server via  │
  │<── JSON-RPC responses ─────│   node-pty on agent ─────────│
```

### 3.3 LSP Architecture

```
┌─────────────────────┐    JSON-RPC      ┌──────────────────┐    stdio
│  Monaco Editor      │ ◄─── over WS ───► │  API: LSP Bridge │ ◄────────►  Language Server
│  monaco-languageclient  │               │  /ws/lsp/:id    │    (rust-analyzer, pyright,
│  vscode-ws-jsonrpc  │               │  node-pty spawn  │     tsserver, gopls…)
└─────────────────────┘               └──────────────────┘
```

---

## 4. New Packages Required

### 4.1 `apps/web`

```jsonc
// Add to dependencies
"monaco-languageclient": "^8.x",
"vscode-ws-jsonrpc": "^3.x",
"vscode-languageserver-protocol": "^3.17.x"
```

```bash
pnpm --filter @mimir/web add monaco-languageclient vscode-ws-jsonrpc vscode-languageserver-protocol
```

> **Note:** `@monaco-editor/react` and `monaco-editor` are already installed. No additional editor packages are needed.

### 4.2 `apps/api` (no new packages)

`node-pty` is already installed. The LSP bridge spawns language servers using the existing PTY infrastructure.

---

## 5. Data Model Changes

### 5.1 `packages/shared/src/types/terminal.ts` — Extend `ShellCard`

```typescript
// Add to existing ShellCard interface
export interface ShellCard {
  id: string;
  sessionId: string;
  instanceId: string;
  instanceName: string;
  label: string;
  status: TerminalSession["status"];
  createdAt: string;

  // ── NEW: Editor integration ─────────────────────────────────────
  /** Whether the editor pane is visible for this shell card */
  editorVisible: boolean;
  /** Currently focused file path on the remote instance */
  activeFilePath: string | null;
  /** Open file paths (tabs within Monaco) */
  openFilePaths: string[];
  /** Working directory as set by the shell session */
  cwd: string | null;
  /** Language server connection status for this card's instance */
  lspStatus: "disconnected" | "connecting" | "connected" | "error";

  // ── Panel layout persistence ──────────────────────────────────────
  /** Whether the file explorer sidebar is visible (independent of editor) */
  explorerVisible: boolean;
  /** Remembered terminal height percentage (default 40) */
  terminalHeightPct: number;
  /** Remembered explorer width percentage (default 25) */
  explorerWidthPct: number;
}
```

### 5.2 `packages/protocol/src/index.ts` — New WS Message Types

```typescript
// Add to existing WsMessageType union
export type WsMessageType =
  // ... existing types ...
  | "fs:list"
  | "fs:listed"
  | "fs:read"
  | "fs:read:result"
  | "fs:write"
  | "fs:write:ack"
  | "fs:watch"
  | "fs:changed"
  | "lsp:connect"
  | "lsp:connected"
  | "lsp:disconnect"
  | "lsp:jsonrpc"; // bidirectional LSP JSON-RPC relay

export interface FsListPayload {
  session_id: string;
  path: string;
}

export interface FsListedPayload {
  session_id: string;
  path: string;
  entries: FsEntry[];
}

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
  modified?: string;
}

export interface FsReadPayload {
  session_id: string;
  path: string;
  request_id: string; // client-generated correlation ID
}

export interface FsReadResultPayload {
  session_id: string;
  path: string;
  request_id: string;
  content: string; // base64-encoded file content
  encoding: "utf8" | "binary";
  error?: string;
}

export interface FsWritePayload {
  session_id: string;
  path: string;
  content: string; // base64-encoded
  request_id: string;
}

export interface FsWriteAckPayload {
  session_id: string;
  path: string;
  request_id: string;
  error?: string;
}

export interface LspConnectPayload {
  session_id: string;
  language_id: string; // "rust", "python", "typescript", etc.
  root_uri: string; // workspace root as file://... URI
}

export interface LspJsonRpcPayload {
  session_id: string;
  message: string; // raw JSON-RPC string
}
```

### 5.3 Prisma — `EditorSession` Model (optional, for audit)

```prisma
// apps/api/prisma/schema.prisma — add model
model EditorSession {
  id              String    @id @default(uuid())
  terminal_session_id  String
  instance_id     String
  user_id         String
  language_id     String?
  root_uri        String?
  started_at      DateTime  @default(now())
  ended_at        DateTime?
  status          String    @default("ACTIVE")

  terminal_session TerminalSession @relation(fields: [terminal_session_id], references: [id])
  instance         Instance        @relation(fields: [instance_id], references: [id])

  @@index([terminal_session_id])
  @@index([instance_id])
}
```

---

## 6. Backend Implementation

### 6.1 API Gateway Extensions (`apps/api/src/agents/gateway.ts`)

Add handlers for the new `fs:*` message types within the existing browser client message handler:

```typescript
// Inside the browser client message handler switch block, after existing cases:

case MESSAGE_TYPE.FS_LIST: {
  const payload = envelope.data as FsListPayload;
  // Route to the agent for this instance via Redis
  const agent = agentConnections.get(envelope.instanceId!);
  if (agent?.ws.readyState === WebSocket.OPEN) {
    agent.ws.send(raw);  // forward as-is; agent handles filesystem access
  } else {
    // Fallback: execute via node-pty on the API host for Docker-local instances
    handleFsListLocal(ws, payload);
  }
  break;
}

case MESSAGE_TYPE.FS_READ: {
  const payload = envelope.data as FsReadPayload;
  const agent = agentConnections.get(envelope.instanceId!);
  if (agent?.ws.readyState === WebSocket.OPEN) {
    agent.ws.send(raw);
  } else {
    handleFsReadLocal(ws, payload);
  }
  break;
}

case MESSAGE_TYPE.FS_WRITE: {
  // Require DEVELOPER role — same guard as terminal:create
  if (!hasDeveloperRole(auth)) {
    sendError(ws, "FORBIDDEN", "Requires DEVELOPER role");
    return;
  }
  const payload = envelope.data as FsWritePayload;
  const agent = agentConnections.get(envelope.instanceId!);
  if (agent?.ws.readyState === WebSocket.OPEN) {
    agent.ws.send(raw);
  } else {
    handleFsWriteLocal(ws, payload);
  }
  break;
}
```

Local fallback helpers use `child_process.execFile` (not PTY) for safety-bounded read/write:

```typescript
// apps/api/src/services/fs-bridge.ts  (new file)

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function readFileFromInstance(
  instanceId: string,
  filePath: string,
): Promise<{ content: string; encoding: "utf8" | "binary" }> {
  // For Docker-local: docker exec; for remote: delegate to agent
  const { stdout } = await execFileAsync("docker", ["exec", instanceId, "cat", "--", filePath], {
    maxBuffer: 5 * 1024 * 1024,
  }); // 5MB limit

  const isText = !stdout.includes("\x00");
  return {
    content: Buffer.from(stdout).toString("base64"),
    encoding: isText ? "utf8" : "binary",
  };
}

export async function writeFileToInstance(
  instanceId: string,
  filePath: string,
  content: string, // base64
): Promise<void> {
  const decoded = Buffer.from(content, "base64");
  // Pipe via docker exec + tee to avoid shell injection
  await execFileAsync("docker", ["exec", "-i", instanceId, "tee", "--", filePath], {
    input: decoded,
  });
}
```

### 6.2 LSP Bridge Route (`apps/api/src/routes/lsp.ts`) — New File

```typescript
/**
 * LSP Bridge — WebSocket upgrade at /ws/lsp/:instanceId
 *
 * Spawns the appropriate language server via node-pty on the instance
 * and relays JSON-RPC messages bidirectionally between the browser
 * (monaco-languageclient) and the language server process.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import pty from "node-pty";
import { authenticateUpgrade } from "../websocket/auth.js";
import { LANGUAGE_SERVERS } from "../lib/lsp-catalog.js";
import { logger } from "../lib/logger.js";

export function attachLspBridge(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/ws\/lsp\/([^/]+)$/);
    if (!match) return;

    const instanceId = match[1];
    const auth = await authenticateUpgrade(req);
    if (!auth) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleLspConnection(ws, instanceId, url.searchParams.get("languageId") ?? "plaintext");
    });
  });
}

const LSP_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function handleLspConnection(ws: WebSocket, instanceId: string, languageId: string): void {
  const serverDef = LANGUAGE_SERVERS[languageId];
  if (!serverDef) {
    ws.close(4004, `No language server configured for: ${languageId}`);
    return;
  }

  logger.info({ instanceId, languageId }, "LSP bridge: spawning language server");

  // Spawn the LS process inside the instance (Docker exec, SSH, etc.)
  const ls = pty.spawn(serverDef.command, serverDef.args, {
    name: "xterm-256color",
    cols: 220,
    rows: 50,
    cwd: serverDef.cwd ?? "/",
    env: { ...process.env, ...serverDef.env },
  });

  let idleTimer = resetIdleTimer();

  // PTY → browser (LS stdout → WS)
  ls.onData((data) => {
    idleTimer = resetIdleTimer(idleTimer);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "lsp:jsonrpc", message: data }));
    }
  });

  ls.onExit(({ exitCode }) => {
    logger.info({ instanceId, languageId, exitCode }, "LSP bridge: LS process exited");
    ws.close(1000, "Language server exited");
  });

  // Browser → PTY (WS → LS stdin)
  ws.on("message", (raw) => {
    try {
      const envelope = JSON.parse(raw.toString());
      if (envelope.type === "lsp:jsonrpc") {
        ls.write(envelope.message);
      }
    } catch {
      logger.warn({ instanceId }, "LSP bridge: malformed message");
    }
  });

  ws.on("close", () => {
    clearTimeout(idleTimer);
    ls.kill();
  });

  function resetIdleTimer(prev?: ReturnType<typeof setTimeout>) {
    if (prev) clearTimeout(prev);
    return setTimeout(() => {
      logger.info({ instanceId, languageId }, "LSP bridge: idle timeout");
      ws.close(1000, "Idle timeout");
    }, LSP_IDLE_TIMEOUT_MS);
  }
}
```

### 6.3 LSP Server Catalog (`apps/api/src/lib/lsp-catalog.ts`) — New File

```typescript
interface LspServerDef {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** File extensions this server handles */
  extensions: string[];
}

export const LANGUAGE_SERVERS: Record<string, LspServerDef> = {
  rust: {
    command: "rust-analyzer",
    args: [],
    extensions: [".rs"],
  },
  python: {
    command: "pyright-langserver",
    args: ["--stdio"],
    extensions: [".py", ".pyi"],
  },
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  go: {
    command: "gopls",
    args: [],
    extensions: [".go"],
  },
  yaml: {
    command: "yaml-language-server",
    args: ["--stdio"],
    extensions: [".yml", ".yaml"],
  },
  toml: {
    command: "taplo",
    args: ["lsp", "stdio"],
    extensions: [".toml"],
  },
};

/** Infer language ID from file extension */
export function inferLanguageId(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  for (const [langId, def] of Object.entries(LANGUAGE_SERVERS)) {
    if (def.extensions.includes(ext)) return langId;
  }
  return "plaintext";
}
```

---

## 7. Frontend Implementation

### 7.1 New Component Tree

```
ShellsTab (extended)
└── ShellCarousel (extended)
    └── ShellCard viewport
        └── ShellSplitPane  ◄── NEW
            ├── ResizablePanelGroup (horizontal)
            │   ├── ResizablePanel — left
            │   │   └── FileExplorer  ◄── NEW
            │   │       ├── FsTreeNode (recursive)
            │   │       └── useFsTree hook  ◄── NEW
            │   ├── ResizableHandle
            │   └── ResizablePanel — right
            │       └── MonacoEditorPane  ◄── NEW
            │           ├── EditorTabs (file tabs)
            │           ├── @monaco-editor/react
            │           └── useLspConnection hook  ◄── NEW
            └── Terminal (existing, below the split or in bottom pane)
```

### 7.2 `ShellSplitPane` Component (`apps/web/src/components/editor/ShellSplitPane.tsx`)

```typescript
import { useState, useCallback } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FileExplorer } from "./FileExplorer";
import { MonacoEditorPane } from "./MonacoEditorPane";
import { Terminal } from "@/components/terminal/Terminal";
import type { ShellCard } from "@/types/terminal";
import type { ConnectionStatus } from "@/hooks/useTerminalWebSocket";
import { cn } from "@/lib/utils";

interface ShellSplitPaneProps {
  card: ShellCard;
  theme: "dark" | "light";
  onStatusChange: (status: ConnectionStatus) => void;
  onEditorVisibilityChange: (visible: boolean) => void;
  onExplorerVisibilityChange: (visible: boolean) => void;
  onActiveFileChange: (path: string | null) => void;
  onOpenFilesChange: (paths: string[]) => void;
  onTerminalHeightChange: (pct: number) => void;
  onExplorerWidthChange: (pct: number) => void;
}

export function ShellSplitPane({
  card,
  theme,
  onStatusChange,
  onEditorVisibilityChange,
  onExplorerVisibilityChange,
  onActiveFileChange,
  onOpenFilesChange,
  onTerminalHeightChange,
  onExplorerWidthChange,
}: ShellSplitPaneProps) {

  const handleFileOpen = useCallback(
    (path: string) => {
      onOpenFilesChange(
        card.openFilePaths.includes(path)
          ? card.openFilePaths
          : [...card.openFilePaths, path],
      );
      onActiveFileChange(path);
    },
    [card.openFilePaths, onOpenFilesChange, onActiveFileChange],
  );

  if (!card.editorVisible) {
    return (
      <Terminal
        sessionId={card.sessionId}
        instanceId={card.instanceId}
        theme={theme}
        onStatusChange={onStatusChange}
        className="h-full"
      />
    );
  }

  return (
    <PanelGroup direction="vertical" className="h-full transition-all duration-200 ease-in-out">
      {/* Top: file explorer + editor */}
      <Panel defaultSize={100 - card.terminalHeightPct} minSize={20}>
        <PanelGroup direction="horizontal" className="h-full">
          {/* File tree — independently collapsible */}
          {card.explorerVisible && (
            <>
              <Panel
                defaultSize={card.explorerWidthPct}
                minSize={15}
                maxSize={40}
                onResize={onExplorerWidthChange}
                className="transition-all duration-200 ease-in-out"
              >
                <FileExplorer
                  instanceId={card.instanceId}
                  sessionId={card.sessionId}
                  cwd={card.cwd ?? "/"}
                  activeFilePath={card.activeFilePath}
                  onFileOpen={handleFileOpen}
                  theme={theme}
                />
              </Panel>
              <PanelResizeHandle className="w-px bg-border hover:bg-primary/40 transition-colors" />
            </>
          )}
          {/* Monaco editor */}
          <Panel minSize={30}>
            <MonacoEditorPane
              instanceId={card.instanceId}
              sessionId={card.sessionId}
              openFilePaths={card.openFilePaths}
              activeFilePath={card.activeFilePath}
              theme={theme}
              onActiveFileChange={onActiveFileChange}
              onOpenFilesChange={onOpenFilesChange}
            />
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle className="h-px bg-border hover:bg-primary/40 transition-colors" />

      {/* Bottom: terminal — persisted height */}
      <Panel defaultSize={card.terminalHeightPct} minSize={15} onResize={onTerminalHeightChange}>
        <Terminal
          sessionId={card.sessionId}
          instanceId={card.instanceId}
          theme={theme}
          onStatusChange={onStatusChange}
          className="h-full"
        />
      </Panel>
    </PanelGroup>
  );
}
```

### 7.3 `FileExplorer` Component (`apps/web/src/components/editor/FileExplorer.tsx`)

```typescript
import { useCallback } from "react";
import { ChevronRight, ChevronDown, FileIcon, FolderIcon, FolderOpen } from "lucide-react";
import { useFsTree } from "@/hooks/useFsTree";
import type { FsEntry } from "@mimir/protocol";
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
  const { tree, expandedPaths, toggleExpand, isLoading, error } = useFsTree({
    instanceId,
    sessionId,
    rootPath: cwd,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-2 text-xs text-red-400">{error}</div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background py-1 font-mono text-xs">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Explorer
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
  entry: FsEntry & { children?: FsEntry[] };
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
        onClick={() => isDir ? onToggle(entry.path) : onFileOpen(entry.path)}
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
      {isDir && isExpanded && entry.children?.map((child) => (
        <FsTreeNode
          key={child.path}
          entry={child as FsEntry & { children?: FsEntry[] }}
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
```

### 7.4 `useFsTree` Hook (`apps/web/src/hooks/useFsTree.ts`)

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import type { FsEntry } from "@mimir/protocol";
import { useTerminalWebSocket } from "./useTerminalWebSocket";

interface UseFsTreeOptions {
  instanceId: string;
  sessionId: string;
  rootPath: string;
}

export function useFsTree({ instanceId, sessionId, rootPath }: UseFsTreeOptions) {
  const [tree, setTree] = useState<(FsEntry & { children?: FsEntry[] })[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [pendingPaths, setPendingPaths] = useState<Set<string>>(new Set([rootPath]));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reuse the existing WS connection for fs: messages
  const { sendFsMessage } = useTerminalWebSocket({ sessionId, terminal: null });

  const requestList = useCallback(
    (path: string) => {
      const requestId = crypto.randomUUID();
      sendFsMessage({ type: "fs:list", session_id: sessionId, path, request_id: requestId });
    },
    [sendFsMessage, sessionId],
  );

  // Request root on mount
  useEffect(() => {
    requestList(rootPath);
  }, [rootPath, requestList]);

  const toggleExpand = useCallback(
    (path: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
          requestList(path);
        }
        return next;
      });
    },
    [requestList],
  );

  // fs:listed messages are injected by the WS hook via a callback
  // (wired via useTerminalWebSocket extension — see §7.5)

  return { tree, expandedPaths, toggleExpand, isLoading, error };
}
```

### 7.5 `MonacoEditorPane` Component (`apps/web/src/components/editor/MonacoEditorPane.tsx`)

```typescript
import { useCallback, useRef, useEffect } from "react";
import MonacoEditor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { X } from "lucide-react";
import { useLspConnection } from "@/hooks/useLspConnection";
import { useFileContent } from "@/hooks/useFileContent";
import { inferLanguageId } from "@/lib/language-detect";
import { cn } from "@/lib/utils";

interface MonacoEditorPaneProps {
  instanceId: string;
  sessionId: string;
  openFilePaths: string[];
  activeFilePath: string | null;
  theme: "dark" | "light";
  onActiveFileChange: (path: string | null) => void;
  onOpenFilesChange: (paths: string[]) => void;
}

export function MonacoEditorPane({
  instanceId,
  sessionId,
  openFilePaths,
  activeFilePath,
  theme,
  onActiveFileChange,
  onOpenFilesChange,
}: MonacoEditorPaneProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const activeLanguageId = activeFilePath
    ? inferLanguageId(activeFilePath)
    : "plaintext";

  // Fetch file content from instance FS over WS
  const { content, isSaving, saveFile, error: fileError } = useFileContent({
    instanceId,
    sessionId,
    filePath: activeFilePath,
  });

  // Connect LSP for the active language
  const { lspStatus } = useLspConnection({
    instanceId,
    languageId: activeLanguageId,
    rootUri: `file:///workspace`,
    enabled: activeFilePath !== null && activeLanguageId !== "plaintext",
  });

  const handleEditorDidMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      // Ctrl+S / Cmd+S to save
      editor.addCommand(
        // eslint-disable-next-line no-bitwise
        Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS,
        () => saveFile(editor.getValue()),
      );
    },
    [saveFile],
  );

  const closeTab = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const remaining = openFilePaths.filter((p) => p !== path);
      onOpenFilesChange(remaining);
      if (activeFilePath === path) {
        onActiveFileChange(remaining[remaining.length - 1] ?? null);
      }
    },
    [openFilePaths, activeFilePath, onOpenFilesChange, onActiveFileChange],
  );

  if (openFilePaths.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-xs">Open a file from the explorer</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* File tabs */}
      <div className="flex items-center overflow-x-auto border-b bg-background scrollbar-none">
        {openFilePaths.map((path) => {
          const fileName = path.split("/").pop() ?? path;
          const isActive = path === activeFilePath;
          return (
            <button
              key={path}
              type="button"
              onClick={() => onActiveFileChange(path)}
              className={cn(
                "flex items-center gap-1.5 border-r px-3 py-1.5 text-xs whitespace-nowrap",
                "hover:bg-accent transition-colors",
                isActive
                  ? "bg-background text-foreground border-b-2 border-b-primary"
                  : "text-muted-foreground",
              )}
            >
              <span>{fileName}</span>
              <X
                className="h-3 w-3 opacity-50 hover:opacity-100"
                onClick={(e) => closeTab(path, e)}
              />
            </button>
          );
        })}
      </div>

      {/* LSP status bar */}
      <div className="flex items-center gap-2 border-b px-3 py-0.5 text-[10px] text-muted-foreground">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", {
            "bg-green-500": lspStatus === "connected",
            "bg-yellow-500": lspStatus === "connecting",
            "bg-gray-400": lspStatus === "disconnected",
            "bg-red-500": lspStatus === "error",
          })}
        />
        <span>{activeLanguageId}</span>
        {isSaving && <span className="ml-auto text-yellow-500">Saving…</span>}
        {fileError && <span className="ml-auto text-red-400">{fileError}</span>}
      </div>

      {/* Monaco editor */}
      <div className="flex-1 overflow-hidden">
        {content !== null && (
          <MonacoEditor
            height="100%"
            language={activeLanguageId}
            value={content}
            theme={theme === "dark" ? "vs-dark" : "vs"}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily:
                '"CaskaydiaCove Nerd Font", "FiraCode Nerd Font", "Cascadia Code", "Fira Code", monospace',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              wordWrap: "on",
              bracketPairColorization: { enabled: true },
              renderLineHighlight: "line",
            }}
          />
        )}
      </div>
    </div>
  );
}
```

### 7.6 `useLspConnection` Hook (`apps/web/src/hooks/useLspConnection.ts`)

```typescript
import { useEffect, useRef, useState } from "react";
import {
  MonacoLanguageClient,
  CloseAction,
  ErrorAction,
  MessageTransports,
} from "monaco-languageclient";
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from "vscode-ws-jsonrpc";

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
  const [lspStatus, setLspStatus] = useState<"disconnected" | "connecting" | "connected" | "error">(
    "disconnected",
  );
  const clientRef = useRef<MonacoLanguageClient | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    setLspStatus("connecting");

    // Ticket-based auth — same flow as terminal sessions
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${location.host}/ws/lsp/${instanceId}?languageId=${languageId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const socket = toSocket(ws);
      const reader = new WebSocketMessageReader(socket);
      const writer = new WebSocketMessageWriter(socket);

      const client = new MonacoLanguageClient({
        name: `${languageId} Language Client`,
        clientOptions: {
          documentSelector: [{ language: languageId }],
          errorHandler: {
            error: () => ({ action: ErrorAction.Continue }),
            closed: () => ({ action: CloseAction.DoNotRestart }),
          },
          workspaceFolder: { uri: rootUri, name: "workspace", index: 0 },
        },
        messageTransports: { reader, writer },
      });

      client
        .start()
        .then(() => setLspStatus("connected"))
        .catch(() => setLspStatus("error"));
      clientRef.current = client;
    };

    ws.onerror = () => setLspStatus("error");
    ws.onclose = () => setLspStatus("disconnected");

    return () => {
      clientRef.current?.stop();
      ws.close();
    };
  }, [enabled, instanceId, languageId, rootUri]);

  return { lspStatus };
}
```

### 7.7 `ShellCarousel` — Toggle Button Addition

In `apps/web/src/components/commands/ShellCarousel.tsx`, add the editor toggle button to the existing card header toolbar:

```typescript
// Add to existing header button row, alongside the existing close button:

import { LayoutPanelLeft, FolderTree } from "lucide-react";

// In the header JSX:

{/* Editor toggle — Ctrl+Shift+E / Cmd+Shift+E */}
<button
  type="button"
  onClick={() => onEditorVisibilityToggle(activeCard.id)}
  className={cn(
    "rounded p-1 transition-colors",
    activeCard.editorVisible
      ? "text-primary bg-primary/10"
      : "text-muted-foreground hover:bg-accent",
  )}
  title={activeCard.editorVisible ? "Hide editor (Ctrl+Shift+E)" : "Show editor (Ctrl+Shift+E)"}
>
  <LayoutPanelLeft className="h-4 w-4" />
</button>

{/* File explorer toggle — only shown when editor is visible */}
{activeCard.editorVisible && (
  <button
    type="button"
    onClick={() => onExplorerVisibilityToggle(activeCard.id)}
    className={cn(
      "rounded p-1 transition-colors",
      activeCard.explorerVisible
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:bg-accent",
    )}
    title={activeCard.explorerVisible ? "Hide file explorer" : "Show file explorer"}
  >
    <FolderTree className="h-4 w-4" />
  </button>
)}
```

Replace the `Terminal` render in the viewport with `ShellSplitPane`:

```typescript
// Replace the existing Terminal viewport block:
<div className="relative h-[calc(100vh-340px)] min-h-[300px] rounded-md border overflow-hidden">
  {cards.map((card, i) => (
    <div key={card.id} className={cn("absolute inset-0", i === activeIndex ? "z-10" : "z-0 invisible")}>
      <ShellSplitPane
        card={card}
        theme={theme}
        onStatusChange={(status) => onStatusChange(card.id, status)}
        onEditorVisibilityChange={(visible) => onEditorVisibilityToggle(card.id, visible)}
        onActiveFileChange={(path) => onActiveFileChange(card.id, path)}
        onOpenFilesChange={(paths) => onOpenFilesChange(card.id, paths)}
      />
    </div>
  ))}
</div>
```

### 7.8 Zustand Store Extensions (`apps/web/src/stores/terminal.ts`)

```typescript
// Extend TerminalStore interface:
interface TerminalStore {
  // ... existing fields ...

  // ── Editor state per shell card ──────────────────────────────────
  toggleEditorVisible: (id: string) => void;
  toggleExplorerVisible: (id: string) => void;
  setActiveFilePath: (id: string, path: string | null) => void;
  setOpenFilePaths: (id: string, paths: string[]) => void;
  setCwd: (id: string, cwd: string) => void;
  setLspStatus: (id: string, status: ShellCard["lspStatus"]) => void;
  setTerminalHeightPct: (id: string, pct: number) => void;
  setExplorerWidthPct: (id: string, pct: number) => void;
}

// Extend the persist partialize to include editor state:
partialize: (state) => ({
  lastActiveSession: state.lastActiveSession,
  shellCards: state.shellCards,
  activeShellIndex: state.activeShellIndex,
  // editorVisible, activeFilePath, openFilePaths are session-only (not persisted)
}),
```

---

## 8. User Journey

### 8.1 "I want to edit a config file while my build is running"

```
1. USER navigates to Commands → Shells tab
2. USER selects "my-dev-box" from the instance dropdown
3. USER clicks [Open Shell]
   → POST /api/v1/instances/:id/terminal
   → sessionId returned, WS connection opened
   → node-pty spawns /bin/bash on the instance
   → xterm.js renders the live shell, status pill turns green

4. USER types: cd /workspace && cargo build
   → keystrokes flow: xterm → WS → gateway → node-pty → shell

5. USER clicks [⊞ Split] (editor toggle button in the card header)
   → editorVisible flips to true
   → ShellSplitPane renders, FileExplorer requests fs:list /workspace
   → File tree populates: src/, Cargo.toml, .env, README.md

6. USER clicks src/config.rs in the file tree
   → fs:read { path: "src/config.rs" } sent over WS
   → gateway forwards to agent → agent reads file → fs:read:result returns base64 content
   → Monaco editor displays the file with syntax highlighting

7. LSP auto-connects for "rust":
   → WS upgrade to /ws/lsp/my-dev-box?languageId=rust
   → gateway spawns rust-analyzer via node-pty on the instance
   → MonacoLanguageClient connects, status indicator turns green
   → hover tooltips, completions, and diagnostics now active

8. USER edits: changes a constant value, Ctrl+S
   → fs:write { path: "src/config.rs", content: base64 } sent over WS
   → file written on the instance
   → rust-analyzer detects the save and updates diagnostics

9. In the bottom terminal pane, USER sees the cargo build complete
   → USER types: cargo run
   → live output streams back via xterm.js

10. USER closes the editor with [⊞ Split] toggle → returns to full-terminal view
    → LSP WS connection closes, rust-analyzer process exits gracefully
```

### 8.2 "I want two shells open, each with its own file open"

```
1. USER opens Shell 1 → my-dev-box → enables editor → opens main.py
   → Python LSP (pyright) connects for Shell 1

2. USER clicks [Open Shell] again → selects staging-1
   → Shell 2 created in the carousel, pill strip shows two entries

3. USER navigates to Shell 2 → enables editor → opens nginx.conf
   → YAML LSP connects for Shell 2 (independent WS connection)

4. USER drags Shell 2 pill to reorder → dnd-kit handles reorder
   → store.reorderShellCards(1, 0)

5. Both editor sessions are independent — switching carousel cards
   preserves the file open in each, LSP reconnects on focus
```

---

## 9. Implementation Phases

### Phase 1 — File System Bridge (2–3 days)

**Goal:** Read and write files on a remote instance from the browser, no editor yet.

- [ ] Add `fs:*` message types to `packages/protocol/src/index.ts`
- [ ] Implement `handleFsListLocal`, `handleFsReadLocal`, `handleFsWriteLocal` in `apps/api/src/services/fs-bridge.ts`
- [ ] Wire `fs:*` cases into `apps/api/src/agents/gateway.ts`
- [ ] Implement `useFsTree` and `useFileContent` hooks in `apps/web`
- [ ] Add `fs:*` handler cases to `useTerminalWebSocket` (or a new `useFsWebSocket` hook sharing the same WS connection)
- [ ] Unit test: mock WS, send `fs:read`, assert base64 response decode

**Deliverable:** `fs:list` and `fs:read` work from the browser dev console.

### Phase 2 — Monaco Editor + File Tabs (2–3 days)

**Goal:** Open files from the instance in a Monaco editor pane.

- [ ] Extend `ShellCard` type with `editorVisible`, `activeFilePath`, `openFilePaths`, `cwd`
- [ ] Extend Zustand store with editor state actions
- [ ] Build `FileExplorer`, `FsTreeNode`, `MonacoEditorPane`, `ShellSplitPane` components
- [ ] Add toggle button to `ShellCarousel` header
- [ ] Wire Ctrl+S to `fs:write` for save
- [ ] Add `react-resizable-panels` to `apps/web` dependencies
- [ ] Visual regression test: editor renders with correct syntax highlighting for `.rs`, `.ts`, `.py`

**Deliverable:** Toggle shows split pane; click file in tree → file opens in Monaco.

### Phase 3 — LSP Integration (3–4 days)

**Goal:** Language intelligence in the editor.

- [ ] Install `monaco-languageclient`, `vscode-ws-jsonrpc`, `vscode-languageserver-protocol`
- [ ] Implement `apps/api/src/routes/lsp.ts` (LSP bridge with node-pty)
- [ ] Implement `apps/api/src/lib/lsp-catalog.ts`
- [ ] Attach LSP bridge in `apps/api/src/index.ts` via `attachLspBridge(server)`
- [ ] Implement `useLspConnection` hook
- [ ] Wire LSP status into `ShellCard` type and status bar UI
- [ ] Test: open a `.ts` file, verify completions appear, verify diagnostics render

**Deliverable:** Full LSP intelligence for TypeScript, Python, Rust files.

### Phase 4 — UX Polish (1–2 days)

**Goal:** Smooth, intuitive panel interactions.

- [ ] **Persist panel sizes per card** — store `terminalHeightPct` and `explorerWidthPct` in the Zustand `ShellCard` state so toggling editor off/on doesn't reset the layout to defaults
- [ ] **Independent file explorer collapse** — add a secondary collapse toggle (chevron or sidebar button) so users can hide just the file tree while keeping the editor open. Support three progressive states: `Full Terminal` → `Terminal + Editor` → `Terminal + Explorer + Editor`
- [ ] **Animated transitions** — add CSS transitions (`transition: flex-basis 200ms ease`) on panel show/hide so the layout doesn't jump abruptly when toggling editor or explorer visibility
- [ ] **Keyboard shortcut for editor toggle** — bind `Ctrl+Shift+E` (or `Cmd+Shift+E` on macOS) to toggle the editor pane per card without reaching for the mouse; register via Monaco's `addCommand` API and a global keydown listener for when the editor isn't focused

### Phase 5 — Security Hardening (1–2 days)

**Goal:** Production-ready.

- [ ] Add `fs:watch` support for live file-change detection (hot-reload without save)
- [ ] File size limit: refuse `fs:read` for files > 2MB, surface user-friendly error
- [ ] Path traversal guard: normalize paths on the API, reject `../` sequences
- [ ] RBAC: enforce DEVELOPER role for all `fs:write` operations
- [ ] `EditorSession` Prisma model + audit logging for LSP connects
- [ ] E2E test: `tests/e2e/shell-editor.spec.ts` covering open → edit → save → verify on instance
- [ ] ADR: document the editor/LSP design decision

---

## 10. Security Considerations

| Risk                                                         | Mitigation                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Path traversal via `fs:read { path: "../../../etc/passwd" }` | Normalize path server-side with `path.resolve(cwd, filePath)`, reject anything outside the instance root       |
| Large file DoS via `fs:read`                                 | 2MB hard cap per read; return `{ error: "FILE_TOO_LARGE" }`                                                    |
| Unauthorized writes via `fs:write`                           | DEVELOPER role required, same as `terminal:create`; all writes audit-logged                                    |
| Language server process escape                               | Spawn LS inside the instance container (docker exec), not on the API host; use `pty.spawn` with explicit `env` |
| LSP connection hijack                                        | Same ticket-based auth as terminal sessions; LSP WS connections tied to `instanceId` and authenticated userId  |
| Idle LSP resource drain                                      | 30-minute idle timeout on LSP WS connections (configurable via env var `LSP_IDLE_TIMEOUT_MS`)                  |
| XSS via file content                                         | Monaco renders content in an `<iframe>` sandbox; file content never injected as raw HTML                       |

---

## 11. Testing Strategy

### Unit Tests (`vitest`)

```
apps/web/tests/
├── fs-bridge.test.ts          — mock WS, assert fs:read round-trip
├── use-fs-tree.test.ts        — hook behaviour with mock WS
├── use-lsp-connection.test.ts — LSP connect/disconnect lifecycle
└── shell-split-pane.test.tsx  — component render + toggle

apps/api/tests/
├── fs-bridge.test.ts          — path normalization, size limit
└── lsp-catalog.test.ts        — language ID inference
```

### E2E Tests (`playwright`)

```
apps/web/tests/e2e/
└── shell-editor.spec.ts
    ├── can toggle editor pane in shell card
    ├── file tree loads for connected instance
    ├── opens file in Monaco with correct language mode
    ├── Ctrl+S saves file (verify via subsequent fs:read)
    ├── LSP status indicator reaches "connected" for TypeScript file
    ├── editor pane is invisible for VIEWER role (hides toggle button)
    └── closing shell card disconnects LSP cleanly
```

---

## 12. File Change Summary

| File                                                  | Change Type                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/shared/src/types/terminal.ts`               | Extend `ShellCard`                                                         |
| `packages/protocol/src/index.ts`                      | Add `fs:*` and `lsp:*` types                                               |
| `apps/api/src/agents/gateway.ts`                      | Handle `fs:*` messages                                                     |
| `apps/api/src/services/fs-bridge.ts`                  | **New** — local FS bridge helpers                                          |
| `apps/api/src/routes/lsp.ts`                          | **New** — LSP WS bridge                                                    |
| `apps/api/src/lib/lsp-catalog.ts`                     | **New** — LS command catalog                                               |
| `apps/api/src/index.ts`                               | Mount `attachLspBridge`                                                    |
| `apps/api/prisma/schema.prisma`                       | Add `EditorSession` model                                                  |
| `apps/web/src/types/terminal.ts`                      | Extend `ShellCard` (mirrored)                                              |
| `apps/web/src/stores/terminal.ts`                     | Add editor state actions                                                   |
| `apps/web/src/hooks/useFsTree.ts`                     | **New**                                                                    |
| `apps/web/src/hooks/useFileContent.ts`                | **New**                                                                    |
| `apps/web/src/hooks/useLspConnection.ts`              | **New**                                                                    |
| `apps/web/src/hooks/useTerminalWebSocket.ts`          | Add `sendFsMessage`                                                        |
| `apps/web/src/lib/language-detect.ts`                 | **New** — ext → languageId map                                             |
| `apps/web/src/components/commands/ShellCarousel.tsx`  | Add toggle button, swap `Terminal` → `ShellSplitPane`                      |
| `apps/web/src/components/editor/ShellSplitPane.tsx`   | **New**                                                                    |
| `apps/web/src/components/editor/FileExplorer.tsx`     | **New**                                                                    |
| `apps/web/src/components/editor/MonacoEditorPane.tsx` | **New**                                                                    |
| `apps/web/package.json`                               | Add `monaco-languageclient`, `vscode-ws-jsonrpc`, `react-resizable-panels` |
| `docs/adr/0017-shell-ide-integration.md`              | **New** ADR                                                                |

---

_End of plan — total estimated effort: 9–14 engineering days (5 phases)._
