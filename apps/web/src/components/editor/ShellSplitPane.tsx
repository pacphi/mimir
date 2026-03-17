import { useCallback } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { GripVertical, GripHorizontal } from "lucide-react";
import { FileExplorer } from "./FileExplorer";
import { MonacoEditorPane } from "./MonacoEditorPane";
import { Terminal } from "@/components/terminal/Terminal";
import { useAppConfig } from "@/hooks/useAppConfig";
import type { ShellCard } from "@/types/terminal";
import type { ConnectionStatus } from "@/hooks/useTerminalWebSocket";

interface ShellSplitPaneProps {
  card: ShellCard;
  theme: "dark" | "light";
  onStatusChange: (status: ConnectionStatus) => void;
  onActiveFileChange: (path: string | null) => void;
  onOpenFilesChange: (paths: string[]) => void;
  onTerminalHeightChange: (pct: number) => void;
  onExplorerWidthChange: (pct: number) => void;
}

export function ShellSplitPane({
  card,
  theme,
  onStatusChange,
  onActiveFileChange,
  onOpenFilesChange,
  onTerminalHeightChange,
  onExplorerWidthChange,
}: ShellSplitPaneProps) {
  const { data: config } = useAppConfig();
  const fsRoot = card.cwd ?? config?.editorFsRoot ?? "/alt/home/developer/workspace";

  const handleFileOpen = useCallback(
    (path: string) => {
      onOpenFilesChange(
        card.openFilePaths.includes(path) ? card.openFilePaths : [...card.openFilePaths, path],
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
    <Group orientation="vertical" className="h-full w-full">
      {/* Top: file explorer + editor */}
      <Panel defaultSize={100 - card.terminalHeightPct} minSize={20}>
        <Group orientation="horizontal" className="h-full w-full">
          {/* File tree — independently collapsible */}
          {card.explorerVisible && (
            <>
              <Panel
                defaultSize="280px"
                minSize="200px"
                maxSize="50%"
                onResize={(size) => onExplorerWidthChange(size.asPercentage)}
              >
                <FileExplorer
                  instanceId={card.instanceId}
                  sessionId={card.sessionId}
                  cwd={fsRoot}
                  activeFilePath={card.activeFilePath}
                  onFileOpen={handleFileOpen}
                  theme={theme}
                />
              </Panel>
              <Separator className="group relative flex w-2 items-center justify-center bg-border/50 hover:bg-primary/30 active:bg-primary/50 transition-colors cursor-col-resize">
                <GripVertical className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary/70" />
              </Separator>
            </>
          )}
          {/* Monaco editor */}
          <Panel minSize="200px">
            <MonacoEditorPane
              instanceId={card.instanceId}
              sessionId={card.sessionId}
              openFilePaths={card.openFilePaths}
              activeFilePath={card.activeFilePath}
              theme={theme}
              lspStatus={card.lspStatus}
              onActiveFileChange={onActiveFileChange}
              onOpenFilesChange={onOpenFilesChange}
            />
          </Panel>
        </Group>
      </Panel>

      <Separator className="group relative flex h-2 items-center justify-center bg-border/50 hover:bg-primary/30 active:bg-primary/50 transition-colors cursor-row-resize">
        <GripHorizontal className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary/70" />
      </Separator>

      {/* Bottom: terminal — persisted height */}
      <Panel
        defaultSize={card.terminalHeightPct}
        minSize="120px"
        onResize={(size) => onTerminalHeightChange(size.asPercentage)}
      >
        <Terminal
          sessionId={card.sessionId}
          instanceId={card.instanceId}
          theme={theme}
          onStatusChange={onStatusChange}
          className="h-full"
        />
      </Panel>
    </Group>
  );
}
