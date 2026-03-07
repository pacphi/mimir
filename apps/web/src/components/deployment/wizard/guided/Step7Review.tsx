import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDeploymentWizardStore } from "@/stores/deploymentWizardStore";
import { PROVIDER_CATALOG } from "@/types/provider-options";
import { useAppConfig } from "@/hooks/useAppConfig";
import { apiFetch } from "@/lib/api-fetch";

interface ReviewRowProps {
  label: string;
  value: string;
}

function ReviewRow({ label, value }: ReviewRowProps) {
  return (
    <div className="flex items-start gap-4 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="text-sm font-medium break-all">{value}</span>
    </div>
  );
}

interface Step7ReviewProps {
  onDeploy: () => void;
  isDeploying: boolean;
  cliAvailable?: boolean;
}

export function Step7Review({ onDeploy, isDeploying, cliAvailable = true }: Step7ReviewProps) {
  const store = useDeploymentWizardStore();
  const { data: appConfig } = useAppConfig();
  const imageDefaults = {
    registry: appConfig?.sindriImageRegistry ?? "ghcr.io/pacphi/sindri",
    version: appConfig?.sindriImageVersion ?? "latest",
  };

  // Save as template state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveSlug, setSaveSlug] = useState("");
  const [saveCategory] = useState("full-stack");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Recompute YAML on mount
  useEffect(() => {
    store.recomputeYaml(imageDefaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providerMeta = store.provider
    ? PROVIDER_CATALOG.find((p) => p.id === store.provider)
    : null;

  async function handleSaveTemplate() {
    if (!saveName.trim() || !saveSlug.trim()) {
      setSaveError("Name and slug are required");
      return;
    }
    setSaveError(null);
    try {
      await apiFetch("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: saveName,
          slug: saveSlug,
          category: saveCategory,
          description: saveDescription,
          yaml_content: store.assembledYaml,
        }),
      });
      setSaveSuccess(true);
      setSaveDialogOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save template");
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ReviewRow label="Name" value={store.name || "(not set)"} />
          <ReviewRow label="Provider" value={providerMeta?.name ?? store.provider ?? "(not set)"} />
          <ReviewRow label="Region" value={store.region || "(not set)"} />
          <ReviewRow label="Compute" value={store.vmSize || "(not set)"} />
          <ReviewRow label="Memory" value={store.memoryGb ? `${store.memoryGb} GB` : "(not set)"} />
          <ReviewRow
            label="Storage"
            value={store.storageGb ? `${store.storageGb} GB` : "(not set)"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Extensions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ReviewRow label="Profile" value={store.profileName ?? "None (explicit list)"} />
          <ReviewRow
            label="Extensions"
            value={
              store.selectedExtensions.length > 0 ? store.selectedExtensions.join(", ") : "None"
            }
          />
        </CardContent>
      </Card>

      {store.secrets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Secrets</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {store.secrets.map((secret, index) => (
              <div
                key={index}
                className="flex items-center gap-4 py-2 border-b border-border last:border-0"
              >
                <code className="text-sm font-mono text-muted-foreground w-32 shrink-0 truncate">
                  {secret.key}
                </code>
                <code className="text-sm font-mono">
                  {"*".repeat(Math.min(secret.value.length, 16))}
                </code>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* YAML Preview */}
      <div className="p-4 bg-muted rounded-md">
        <h4 className="text-sm font-medium mb-1">Assembled YAML</h4>
        <pre className="text-xs font-mono text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap">
          {store.assembledYaml || "(computing...)"}
        </pre>
      </div>

      {/* Save as Template (inline) */}
      {saveDialogOpen && (
        <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
          <h4 className="text-sm font-medium">Save as Template</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Name</label>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={saveName}
                onChange={(e) => {
                  setSaveName(e.target.value);
                  if (!saveSlug) {
                    setSaveSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    );
                  }
                }}
                placeholder="My Template"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Slug</label>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
                value={saveSlug}
                onChange={(e) => setSaveSlug(e.target.value)}
                placeholder="my-template"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Description</label>
            <textarea
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm min-h-[60px]"
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              placeholder="Brief description of this template"
            />
          </div>
          {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void handleSaveTemplate()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          {!saveSuccess ? (
            <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(!saveDialogOpen)}>
              Save as Template
            </Button>
          ) : (
            <span className="text-xs text-green-600">Template saved</span>
          )}
        </div>

        <div>
          {!cliAvailable && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-1 text-right">
              CLI not configured — deployment unavailable
            </p>
          )}
          {cliAvailable && (
            <p className="text-xs text-muted-foreground mb-1 text-right">
              Deploy to {providerMeta?.name ?? store.provider}
            </p>
          )}
          <Button
            size="lg"
            onClick={onDeploy}
            disabled={
              !cliAvailable || isDeploying || !store.name || !store.provider || !store.region
            }
            className="min-w-[120px]"
          >
            {isDeploying ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Deploying...
              </span>
            ) : (
              "Deploy"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
