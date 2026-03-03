import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Key, Plus, Trash2, Copy, Check, Loader2, AlertTriangle, Shield } from "lucide-react";

interface ApiKeyInfo {
  id: string;
  key_prefix: string | null;
  name: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

interface CreateApiKeyResponse extends ApiKeyInfo {
  key: string;
}

interface MeResponse {
  role: string;
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Full access — users, teams, secrets, deployments, all fleet operations",
  OPERATOR: "Deploy, manage secrets, run commands, view all data",
  DEVELOPER: "Run commands, scheduled tasks, view instances and metrics",
  VIEWER: "Read-only — dashboards, instances, metrics, logs",
};

const ROLES = ["ADMIN", "OPERATOR", "DEVELOPER", "VIEWER"] as const;

function RolePermissionsCard({
  currentRole,
  isLoading,
}: {
  currentRole?: string;
  isLoading?: boolean;
}) {
  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span>
          Your keys inherit your role:{" "}
          {isLoading ? (
            <Loader2 className="inline h-3 w-3 animate-spin" />
          ) : (
            <Badge variant="secondary" className="font-mono text-xs">
              {currentRole}
            </Badge>
          )}
        </span>
      </div>
      <div className="grid gap-1.5 text-xs">
        {ROLES.map((role) => (
          <div
            key={role}
            className={`flex gap-3 rounded px-2 py-1 ${
              role === currentRole
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground"
            }`}
          >
            <span className="w-24 font-mono shrink-0">{role}</span>
            <span>{ROLE_DESCRIPTIONS[role]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageExplanation() {
  return (
    <div className="text-sm text-muted-foreground space-y-2">
      <p>
        API keys authenticate external systems against the Mimir API — the Sindri CLI, CI/CD
        pipelines, monitoring tools, or any script that calls the REST API.
      </p>
      <p>
        Usage:{" "}
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
          Authorization: Bearer sk-...
        </code>{" "}
        or{" "}
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">X-Api-Key: sk-...</code>
      </p>
      <p>
        Use descriptive names to track which system each key is for. Set expirations and rotate
        periodically by creating a replacement before revoking the old key.
      </p>
    </div>
  );
}

export function ApiKeysTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [expiryDays, setExpiryDays] = useState<string>("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<MeResponse>("/me"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["me", "api-keys"],
    queryFn: () => apiFetch<{ data: ApiKeyInfo[]; total: number }>("/me/api-keys"),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; expires_in_days?: number }) =>
      apiFetch<CreateApiKeyResponse>("/me/api-keys", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setNewKeyName("");
      setExpiryDays("");
      queryClient.invalidateQueries({ queryKey: ["me", "api-keys"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/me/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me", "api-keys"] });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    const days = expiryDays ? parseInt(expiryDays, 10) : undefined;
    createMutation.mutate({
      name: newKeyName.trim(),
      expires_in_days: days && days > 0 ? days : undefined,
    });
  }

  function handleCopy() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  const currentRole = me?.role;
  const hasKeys = data && data.data.length > 0;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">API Keys</h2>
          <p className="text-sm text-muted-foreground">
            Manage API keys for CLI and programmatic access.
          </p>
        </div>
        {!showCreate && !createdKey && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create key
          </Button>
        )}
      </div>

      <RolePermissionsCard currentRole={currentRole} isLoading={meLoading} />
      <UsageExplanation />

      {createdKey && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Save this key now — it won't be shown again.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all">
              {createdKey}
            </code>
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreatedKey(null);
              setShowCreate(false);
            }}
          >
            Done
          </Button>
        </div>
      )}

      {showCreate && !createdKey && (
        <form onSubmit={handleCreate} className="rounded-md border p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key-name">Key name</Label>
            <Input
              id="key-name"
              placeholder="e.g. CI Pipeline, Local Development"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="key-expiry">Expiry (days, optional)</Label>
            <Input
              id="key-expiry"
              type="number"
              placeholder="e.g. 90, 365"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              min={1}
            />
            <p className="text-xs text-muted-foreground">
              Recommended: 90 days for CI/CD, 365 for long-lived tools. Leave empty for
              non-expiring.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Create
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
                setNewKeyName("");
                setExpiryDays("");
              }}
            >
              Cancel
            </Button>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-destructive">
              {createMutation.error?.message || "Failed to create key"}
            </p>
          )}
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !hasKeys ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <Key className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p>No API keys yet.</p>
          <p>
            Create one to authenticate the Sindri CLI, CI/CD pipelines, or external monitoring
            tools.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {data?.data.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
            >
              <Key className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{key.name}</span>
                  {key.key_prefix && (
                    <code className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                      {key.key_prefix}...
                    </code>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Created {new Date(key.created_at).toLocaleDateString()}
                  {key.last_used_at && (
                    <>
                      {" · "}Last used {new Date(key.last_used_at).toLocaleDateString()}
                    </>
                  )}
                  {key.expires_at && (
                    <>
                      {" · "}
                      {isExpired(key.expires_at) ? (
                        <span className="text-destructive">Expired</span>
                      ) : (
                        <>Expires {new Date(key.expires_at).toLocaleDateString()}</>
                      )}
                    </>
                  )}
                  {!key.expires_at && " · Never expires"}
                </div>
              </div>
              {isExpired(key.expires_at) && (
                <Badge variant="destructive" className="text-xs">
                  Expired
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => deleteMutation.mutate(key.id)}
                disabled={deleteMutation.isPending}
                title="Revoke key"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
