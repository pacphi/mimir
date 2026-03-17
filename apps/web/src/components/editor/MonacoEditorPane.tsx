import { useCallback, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { X } from "lucide-react";
import { useFileContent } from "@/hooks/useFileContent";
import { inferLanguageId } from "@/lib/language-detect";
import { cn } from "@/lib/utils";

interface MonacoEditorPaneProps {
  instanceId: string;
  sessionId: string;
  openFilePaths: string[];
  activeFilePath: string | null;
  theme: "dark" | "light";
  lspStatus: "disconnected" | "connecting" | "connected" | "error";
  onActiveFileChange: (path: string | null) => void;
  onOpenFilesChange: (paths: string[]) => void;
}

export function MonacoEditorPane({
  instanceId,
  sessionId,
  openFilePaths,
  activeFilePath,
  theme,
  lspStatus,
  onActiveFileChange,
  onOpenFilesChange,
}: MonacoEditorPaneProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const activeLanguageId = activeFilePath ? inferLanguageId(activeFilePath) : "plaintext";

  const {
    content,
    isLoading,
    isSaving,
    saveFile,
    error: fileError,
  } = useFileContent({
    instanceId,
    sessionId,
    filePath: activeFilePath,
    enabled: activeFilePath !== null,
  });

  const handleEditorDidMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      editorRef.current = editor;
      // Ctrl+S / Cmd+S to save
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
        saveFile(editor.getValue()),
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

      {/* Status bar */}
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
        {isSaving && <span className="ml-auto text-yellow-500">Saving...</span>}
        {isLoading && <span className="ml-auto text-muted-foreground">Loading...</span>}
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
