/**
 * Modal for setting a platform pricing credential via the secrets vault.
 *
 * Stores the value as `pricing.<providerId>` with type API_KEY.
 * Env var always takes priority when both are present.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { PlatformIntegrationStatus } from "@/api/integrations";

interface IntegrationKeyEditorProps {
  integration: PlatformIntegrationStatus;
  onClose: () => void;
}

export function IntegrationKeyEditor({ integration, onClose }: IntegrationKeyEditorProps) {
  const [value, setValue] = useState("");
  const queryClient = useQueryClient();

  const vaultName = `pricing.${integration.id.replace("-pricing", "")}`;

  const saveMutation = useMutation({
    mutationFn: async (secretValue: string) => {
      // Try to update existing, or create new
      const existingResponse = await apiFetch<{
        secrets: Array<{ id: string; name: string }>;
      }>(`/secrets?type=API_KEY&pageSize=100`);
      const existing = existingResponse.secrets.find((s) => s.name === vaultName);

      if (existing) {
        return apiFetch(`/secrets/${existing.id}`, {
          method: "PUT",
          body: JSON.stringify({ value: secretValue }),
        });
      }

      return apiFetch("/secrets", {
        method: "POST",
        body: JSON.stringify({
          name: vaultName,
          description: `Pricing API key for ${integration.name}`,
          type: "API_KEY",
          value: secretValue,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const existingResponse = await apiFetch<{
        secrets: Array<{ id: string; name: string }>;
      }>(`/secrets?type=API_KEY&pageSize=100`);
      const existing = existingResponse.secrets.find((s) => s.name === vaultName);
      if (existing) {
        await apiFetch(`/secrets/${existing.id}`, { method: "DELETE" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    saveMutation.mutate(value.trim());
  }

  const isPending = saveMutation.isPending || deleteMutation.isPending;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold">Set {integration.name} Key</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Store in the encrypted secrets vault. The env var{" "}
            <code className="font-mono text-xs">{integration.envVarName}</code> takes priority when
            both are present.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="integration-key">API Key</Label>
            <Input
              id="integration-key"
              type="password"
              placeholder="Paste your API key"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>

          {integration.setupUrl && (
            <a
              href={integration.setupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline block"
            >
              Where to get this key
            </a>
          )}

          {(saveMutation.isError || deleteMutation.isError) && (
            <p className="text-sm text-destructive">
              {(saveMutation.error ?? deleteMutation.error)?.message ?? "Operation failed"}
            </p>
          )}

          <div className="flex justify-between">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Clear vault entry
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isPending || !value.trim()}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Save to vault
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
