import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Server,
  Settings,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  Search,
  Rocket,
  Terminal,
  Calendar,
  ScrollText,
  Bell,
  DollarSign,
  Shield,
  Package,
  GitCompare,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { useThemeStore } from "@/stores/themeStore";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";
import { Button } from "@/components/ui/button";
import { AlertNotifications } from "@/components/alerts/AlertNotifications";
import { signOut, useSession } from "@/lib/auth-client";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/instances", label: "Instances", icon: Server },
  { to: "/deployments", label: "Deployments", icon: Rocket },
  { to: "/commands", label: "Commands", icon: Terminal },
  { to: "/tasks", label: "Scheduled Tasks", icon: Calendar },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/costs", label: "Costs", icon: DollarSign },
  { to: "/extensions", label: "Extensions", icon: Package },
  { to: "/security", label: "Security", icon: Shield },
  { to: "/drift", label: "Config Drift", icon: GitCompare },
  { to: "/settings", label: "Admin", icon: Settings },
] as const;

export function Sidebar() {
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const { theme, setTheme } = useThemeStore();
  const openPalette = useCommandPaletteStore((state) => state.openPalette);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };

  const themes = ["light", "dark", "system"] as const;
  const nextTheme = themes[(themes.indexOf(theme) + 1) % themes.length];
  const ThemeIcon = themeIcons[theme];

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r border-border bg-card transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">M</span>
            </div>
            <span className="font-semibold text-sm">Mimir</span>
          </div>
        )}
        {collapsed && (
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center mx-auto">
            <span className="text-primary-foreground text-xs font-bold">M</span>
          </div>
        )}
        {!collapsed && (
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-7 w-7 shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search / Command Palette trigger */}
      <div className="px-2 py-2 border-b border-border">
        <button
          onClick={() => openPalette("command")}
          className={cn(
            "flex items-center gap-2 w-full rounded-md px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted transition-colors",
            collapsed && "justify-center px-2",
          )}
          title={collapsed ? "Command palette (⌘K)" : undefined}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-xs">Search...</span>
              <kbd className="text-xs bg-background border border-border rounded px-1 font-mono">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = currentPath.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-border space-y-1">
        {/* Alert notification bell */}
        <div className={cn("flex", collapsed ? "justify-center" : "justify-end px-1 pb-1")}>
          <AlertNotifications />
        </div>
        <UserMenu collapsed={collapsed} />
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={() => setTheme(nextTheme)}
          className={cn("w-full", collapsed ? "h-9 w-9 mx-auto flex" : "justify-start gap-3 px-3")}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Theme: {theme}</span>}
        </Button>

        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-9 w-9 mx-auto flex"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </aside>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { data: session } = useSession();
  const navigate = useNavigate();

  if (!session?.user) return null;

  const user = session.user;
  const displayName = user.name || user.email;
  const role = (user as unknown as { role?: string }).role;
  const initial = (user.name?.[0] || user.email[0] || "U").toUpperCase();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="space-y-1">
      <Link
        to="/settings"
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          collapsed && "justify-center px-2",
        )}
        title={collapsed ? displayName : undefined}
      >
        {user.image ? (
          <img src={user.image} alt="" className="h-5 w-5 rounded-full shrink-0" />
        ) : (
          <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-[10px] font-medium">{initial}</span>
          </div>
        )}
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-xs truncate">{displayName}</div>
            {role && <div className="text-[10px] text-muted-foreground">{role}</div>}
          </div>
        )}
      </Link>

      <Button
        variant="ghost"
        size={collapsed ? "icon" : "sm"}
        onClick={handleSignOut}
        className={cn("w-full", collapsed ? "h-9 w-9 mx-auto flex" : "justify-start gap-3 px-3")}
        title={collapsed ? "Sign out" : undefined}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed && <span>Sign out</span>}
      </Button>
    </div>
  );
}
