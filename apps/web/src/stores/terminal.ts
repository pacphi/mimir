import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TerminalSession, ShellCard } from "@/types/terminal";

interface TerminalStore {
  // Active sessions per instance (instanceId -> sessionId[])
  sessions: Record<string, TerminalSession[]>;
  // Last active tab per instance (instanceId -> sessionId)
  lastActiveSession: Record<string, string>;

  addSession: (instanceId: string, session: TerminalSession) => void;
  removeSession: (instanceId: string, sessionId: string) => void;
  updateSessionStatus: (
    instanceId: string,
    sessionId: string,
    status: TerminalSession["status"],
  ) => void;
  setLastActiveSession: (instanceId: string, sessionId: string) => void;
  getInstanceSessions: (instanceId: string) => TerminalSession[];
  clearInstanceSessions: (instanceId: string) => void;

  // Shell cards for the Shells tab carousel
  shellCards: ShellCard[];
  activeShellIndex: number;

  addShellCard: (card: ShellCard) => void;
  removeShellCard: (id: string) => void;
  updateShellCardLabel: (id: string, label: string) => void;
  updateShellCardStatus: (id: string, status: ShellCard["status"]) => void;
  reorderShellCards: (fromIndex: number, toIndex: number) => void;
  setActiveShellIndex: (index: number) => void;

  // Editor state actions
  toggleEditorVisible: (id: string) => void;
  toggleExplorerVisible: (id: string) => void;
  setActiveFilePath: (id: string, path: string | null) => void;
  setOpenFilePaths: (id: string, paths: string[]) => void;
  setCwd: (id: string, cwd: string) => void;
  setLspStatus: (id: string, status: ShellCard["lspStatus"]) => void;
  setTerminalHeightPct: (id: string, pct: number) => void;
  setExplorerWidthPct: (id: string, pct: number) => void;
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set, get) => ({
      sessions: {},
      lastActiveSession: {},
      shellCards: [],
      activeShellIndex: 0,

      addSession: (instanceId, session) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [instanceId]: [...(state.sessions[instanceId] ?? []), session],
          },
        }));
      },

      removeSession: (instanceId, sessionId) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [instanceId]: (state.sessions[instanceId] ?? []).filter(
              (s) => s.sessionId !== sessionId,
            ),
          },
        }));
      },

      updateSessionStatus: (instanceId, sessionId, status) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [instanceId]: (state.sessions[instanceId] ?? []).map((s) =>
              s.sessionId === sessionId ? { ...s, status } : s,
            ),
          },
        }));
      },

      setLastActiveSession: (instanceId, sessionId) => {
        set((state) => ({
          lastActiveSession: {
            ...state.lastActiveSession,
            [instanceId]: sessionId,
          },
        }));
      },

      getInstanceSessions: (instanceId) => {
        return get().sessions[instanceId] ?? [];
      },

      clearInstanceSessions: (instanceId) => {
        set((state) => {
          const { [instanceId]: _removed, ...remainingSessions } = state.sessions;
          const { [instanceId]: _removedActive, ...remainingActive } = state.lastActiveSession;
          return {
            sessions: remainingSessions,
            lastActiveSession: remainingActive,
          };
        });
      },

      addShellCard: (card) => {
        set((state) => ({
          shellCards: [...state.shellCards, card],
          activeShellIndex: state.shellCards.length, // Navigate to newly added card
        }));
      },

      removeShellCard: (id) => {
        set((state) => {
          const idx = state.shellCards.findIndex((c) => c.id === id);
          const next = state.shellCards.filter((c) => c.id !== id);
          const newIndex = Math.min(
            state.activeShellIndex >= idx
              ? Math.max(0, state.activeShellIndex - 1)
              : state.activeShellIndex,
            Math.max(0, next.length - 1),
          );
          return { shellCards: next, activeShellIndex: newIndex };
        });
      },

      updateShellCardLabel: (id, label) => {
        set((state) => ({
          shellCards: state.shellCards.map((c) => (c.id === id ? { ...c, label } : c)),
        }));
      },

      updateShellCardStatus: (id, status) => {
        set((state) => ({
          shellCards: state.shellCards.map((c) => (c.id === id ? { ...c, status } : c)),
        }));
      },

      reorderShellCards: (fromIndex, toIndex) => {
        set((state) => {
          const cards = [...state.shellCards];
          const [moved] = cards.splice(fromIndex, 1);
          cards.splice(toIndex, 0, moved);
          // Keep the active card focused after reorder
          let newActiveIndex = state.activeShellIndex;
          if (state.activeShellIndex === fromIndex) {
            newActiveIndex = toIndex;
          } else if (fromIndex < state.activeShellIndex && toIndex >= state.activeShellIndex) {
            newActiveIndex = state.activeShellIndex - 1;
          } else if (fromIndex > state.activeShellIndex && toIndex <= state.activeShellIndex) {
            newActiveIndex = state.activeShellIndex + 1;
          }
          return { shellCards: cards, activeShellIndex: newActiveIndex };
        });
      },

      setActiveShellIndex: (index) => {
        set({ activeShellIndex: index });
      },

      toggleEditorVisible: (id) => {
        set((state) => ({
          shellCards: state.shellCards.map((c) => {
            if (c.id !== id) return c;
            const nowVisible = !c.editorVisible;
            return {
              ...c,
              editorVisible: nowVisible,
              // Set sensible defaults when first enabling editor
              explorerVisible: nowVisible ? c.explorerVisible || true : c.explorerVisible,
              terminalHeightPct:
                nowVisible && c.terminalHeightPct === 100 ? 40 : c.terminalHeightPct,
              explorerWidthPct: nowVisible && c.explorerWidthPct === 0 ? 25 : c.explorerWidthPct,
            };
          }),
        }));
      },

      toggleExplorerVisible: (id) => {
        set((state) => ({
          shellCards: state.shellCards.map((c) =>
            c.id === id ? { ...c, explorerVisible: !c.explorerVisible } : c,
          ),
        }));
      },

      setActiveFilePath: (id, path) => {
        set((state) => ({
          shellCards: state.shellCards.map((c) =>
            c.id === id ? { ...c, activeFilePath: path } : c,
          ),
        }));
      },

      setOpenFilePaths: (id, paths) => {
        set((state) => ({
          shellCards: state.shellCards.map((c) =>
            c.id === id ? { ...c, openFilePaths: paths } : c,
          ),
        }));
      },

      setCwd: (id, cwd) => {
        set((state) => ({
          shellCards: state.shellCards.map((c) => (c.id === id ? { ...c, cwd } : c)),
        }));
      },

      setLspStatus: (id, status) => {
        set((state) => ({
          shellCards: state.shellCards.map((c) => (c.id === id ? { ...c, lspStatus: status } : c)),
        }));
      },

      setTerminalHeightPct: (id, pct) => {
        set((state) => ({
          shellCards: state.shellCards.map((c) =>
            c.id === id ? { ...c, terminalHeightPct: pct } : c,
          ),
        }));
      },

      setExplorerWidthPct: (id, pct) => {
        set((state) => ({
          shellCards: state.shellCards.map((c) =>
            c.id === id ? { ...c, explorerWidthPct: pct } : c,
          ),
        }));
      },
    }),
    {
      name: "sindri-terminal-store",
      partialize: (state) => ({
        lastActiveSession: state.lastActiveSession,
        shellCards: state.shellCards,
        activeShellIndex: state.activeShellIndex,
      }),
    },
  ),
);
