import type React from "react";
import { useState } from "react";
import { UsersPage } from "./UsersPage";
import { TeamsPage } from "./TeamsPage";
import { PermissionMatrix } from "./PermissionMatrix";
import { AuditLogViewer } from "./AuditLogViewer";
import { SettingsPage } from "./SettingsPage";
import { ProfileTab } from "./ProfileTab";
import { ApiKeysTab } from "./ApiKeysTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { cn } from "@/lib/utils";
import { Users, Shield, ScrollText, Settings, Building2, User, Key, Plug } from "lucide-react";
import { useSession } from "@/lib/auth-client";

type AdminTab =
  | "profile"
  | "api-keys"
  | "settings"
  | "integrations"
  | "users"
  | "teams"
  | "permissions"
  | "audit";

interface TabDef {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const TABS: TabDef[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "integrations", label: "Integrations", icon: Plug, adminOnly: true },
  { id: "users", label: "Users", icon: Users, adminOnly: true },
  { id: "teams", label: "Teams", icon: Building2, adminOnly: true },
  { id: "permissions", label: "Permissions", icon: Shield, adminOnly: true },
  { id: "audit", label: "Audit Log", icon: ScrollText, adminOnly: true },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("profile");
  const { data: session } = useSession();
  const userRole = (session?.user as unknown as { role?: string } | undefined)?.role;
  const isAdmin = userRole === "ADMIN";

  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <div className="flex h-full">
      <div className="w-48 shrink-0 border-r border-border p-2 space-y-1">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-left transition-colors",
              activeTab === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "api-keys" && <ApiKeysTab />}
        {activeTab === "settings" && <SettingsPage />}
        {activeTab === "integrations" && isAdmin && <IntegrationsTab />}
        {activeTab === "users" && isAdmin && <UsersPage />}
        {activeTab === "teams" && isAdmin && <TeamsPage />}
        {activeTab === "permissions" && isAdmin && <PermissionMatrix />}
        {activeTab === "audit" && isAdmin && <AuditLogViewer />}
      </div>
    </div>
  );
}
