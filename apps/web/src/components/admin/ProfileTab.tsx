import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { Badge } from "@/components/ui/badge";
import { type LucideIcon, Globe, Mail, Loader2 } from "lucide-react";

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

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

const PROVIDER_META: Record<string, { label: string; icon: LucideIcon | typeof GithubIcon }> = {
  github: { label: "GitHub", icon: GithubIcon },
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
