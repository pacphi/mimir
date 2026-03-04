import { useState, useCallback } from "react";
import { Plus, SquareTerminal } from "lucide-react";
import type { Instance } from "@/types/instance";
import type { ShellCard } from "@/types/terminal";
import { createTerminalSession, closeTerminalSession } from "@/api/terminal";
import { useTerminalStore } from "@/stores/terminal";
import { InstanceSelector } from "./InstanceSelector";
import { ShellCarousel } from "./ShellCarousel";
import { cn } from "@/lib/utils";

interface ShellsTabProps {
  instances: Instance[];
}

export function ShellsTab({ instances }: ShellsTabProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    shellCards,
    activeShellIndex,
    addShellCard,
    removeShellCard,
    updateShellCardLabel,
    updateShellCardStatus,
    reorderShellCards,
    setActiveShellIndex,
  } = useTerminalStore();

  const selectedInstance = instances.find((i) => i.id === selectedIds[0]);

  const handleOpenShell = useCallback(async () => {
    if (!selectedInstance) return;
    setError(null);
    setOpening(true);
    try {
      const { sessionId } = await createTerminalSession(selectedInstance.id);
      const card: ShellCard = {
        id: crypto.randomUUID(),
        sessionId,
        instanceId: selectedInstance.id,
        instanceName: selectedInstance.name,
        label: `Shell - ${selectedInstance.name}`,
        status: "connecting",
        createdAt: new Date().toISOString(),
      };
      addShellCard(card);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open shell");
    } finally {
      setOpening(false);
    }
  }, [selectedInstance, addShellCard]);

  const handleClose = useCallback(
    async (id: string) => {
      const card = shellCards.find((c) => c.id === id);
      if (card) {
        try {
          await closeTerminalSession(card.instanceId, card.sessionId);
        } catch {
          // Best-effort cleanup
        }
      }
      removeShellCard(id);
    },
    [shellCards, removeShellCard],
  );

  return (
    <div className="space-y-3">
      {/* Instance selector + Open Shell button */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Target Instance
          </label>
          <InstanceSelector
            instances={instances}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            maxSelections={1}
            placeholder="Select a running instance..."
          />
        </div>
        <button
          type="button"
          disabled={!selectedInstance || opening}
          onClick={handleOpenShell}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          )}
        >
          {opening ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Open Shell
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Carousel or empty state */}
      {shellCards.length > 0 ? (
        <ShellCarousel
          cards={shellCards}
          activeIndex={activeShellIndex}
          onNavigate={setActiveShellIndex}
          onReorder={reorderShellCards}
          onClose={handleClose}
          onLabelChange={updateShellCardLabel}
          onStatusChange={updateShellCardStatus}
          theme="dark"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-muted-foreground">
          <SquareTerminal className="h-10 w-10 opacity-40" />
          <p className="text-sm">No shell sessions open</p>
          <p className="text-xs">Select an instance above and click "Open Shell" to start</p>
        </div>
      )}
    </div>
  );
}
