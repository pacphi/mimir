import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { Badge } from "@/components/ui/badge";
import { Github, Globe, Mail, Loader2 } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  email_verified: boolean;
  image: string | null;
  last_login_at: string | null;
  created_at: string;
  team_memberships: Array<{
    role: string;
    team: { id: string; name: string };
  }>;
  accounts: Array<{
    id: string;
    provider_id: string;
    created_at: string;
  }>;
}

const PROVIDER_META: Record<string, { label: string; icon: typeof Github }> = {
  github: { label: "GitHub", icon: Github },
  google: { label: "Google", icon: Globe },
  credential: { label: "Email", icon: Mail },
};

export function ProfileTab() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserProfile>("/me"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return <div className="p-6 text-center text-muted-foreground">Failed to load profile.</div>;
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-1">Profile</h2>
        <p className="text-sm text-muted-foreground">Your account information.</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          {profile.image ? (
            <img src={profile.image} alt="" className="h-16 w-16 rounded-full" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xl font-medium">
                {(profile.name?.[0] || profile.email[0] || "U").toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <div className="font-medium text-lg">{profile.name || "No name set"}</div>
            <div className="text-sm text-muted-foreground">{profile.email}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground mb-1">Role</div>
            <Badge variant="outline">{profile.role}</Badge>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Email Verified</div>
            <span>{profile.email_verified ? "Yes" : "No"}</span>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Member Since</div>
            <span>{new Date(profile.created_at).toLocaleDateString()}</span>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Last Login</div>
            <span>
              {profile.last_login_at ? new Date(profile.last_login_at).toLocaleString() : "Never"}
            </span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Linked Accounts</h3>
        {profile.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked accounts.</p>
        ) : (
          <div className="space-y-2">
            {profile.accounts.map((account) => {
              const meta = PROVIDER_META[account.provider_id];
              const Icon = meta?.icon || Globe;
              return (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{meta?.label || account.provider_id}</span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    Linked {new Date(account.created_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Team Memberships</h3>
        {profile.team_memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not a member of any teams. Contact an admin to get assigned.
          </p>
        ) : (
          <div className="space-y-2">
            {profile.team_memberships.map((membership) => (
              <div
                key={membership.team.id}
                className="flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
              >
                <span className="font-medium">{membership.team.name}</span>
                <Badge variant="outline" className="ml-auto">
                  {membership.role}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
