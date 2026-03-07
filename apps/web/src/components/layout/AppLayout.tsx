import { type ReactNode } from "react";
import { ShieldOff } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { useInstanceWebSocket } from "@/hooks/useInstanceWebSocket";
import { useAppConfig } from "@/hooks/useAppConfig";
import { CommandPalette } from "@/components/command-palette";

interface AppLayoutProps {
  children: ReactNode;
}

function AuthBypassBanner() {
  const { data } = useAppConfig();

  if (!data?.authBypass) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-medium text-black">
      <ShieldOff className="h-3.5 w-3.5" />
      Auth bypass active — all requests authenticate as seed admin. Do not use in production.
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  // Establish the WebSocket connection at the app level so it persists
  useInstanceWebSocket();

  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main
        className={cn(
          "flex-1 flex flex-col overflow-hidden transition-all duration-200",
          sidebarCollapsed ? "ml-0" : "ml-0",
        )}
      >
        <AuthBypassBanner />
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
      <CommandPalette />
    </div>
  );
}
