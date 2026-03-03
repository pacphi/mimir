import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SindriYamlEditor } from "@/components/deployment/SindriYamlEditor";
import { useDeploymentWizardStore } from "@/stores/deploymentWizardStore";
import { deploymentsApi } from "@/api/deployments";
import { apiFetch } from "@/lib/api-fetch";
import { parseSimpleYaml } from "@/lib/yaml-parser";

interface SavedTemplate {
  id: string;
  name: string;
  slug: string;
  yaml_content: string;
}

interface ExpertModeProps {
  onCancel: () => void;
  cliAvailable?: boolean;
}

export function ExpertMode({ onCancel, cliAvailable = true }: ExpertModeProps) {
  const store = useDeploymentWizardStore();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("blank");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveSlug, setSaveSlug] = useState("");
  const [saveCategory, setSaveCategory] = useState("full-stack");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: templates } = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiFetch<{ templates: SavedTemplate[] }>("/templates").then((r) => r.templates),
    staleTime: 60_000,
  });

  const handleYamlChange = useCallback(
    (value: string) => {
      store.setYamlContent(value);
    },
    [store],
  );

  function handleTemplateSelect(value: string) {
    setSelectedTemplate(value);
    if (value === "blank") {
      store.setYamlContent("");
      return;
    }
    const tpl = templates?.find((t) => t.id === value);
    if (tpl) {
      store.setYamlContent(tpl.yaml_content);
    }
  }

  async function handleDeploy() {
    const yaml = store.yamlContent;
    if (!yaml.trim()) {
      store.setDeployError("YAML content is required");
      return;
    }

    // Parse name/provider/region from YAML
    const parsed = parseSimpleYaml(yaml);
    if (!parsed.value) {
      store.setDeployError("Failed to parse YAML configuration");
      return;
    }

    const name = String(parsed.value.name ?? "");
    const provider = String(parsed.value.deployment?.provider ?? "");
    if (!name || !provider) {
      store.setDeployError("YAML must contain 'name' and 'deployment.provider' fields");
      return;
    }

    store.setIsDeploying(true);
    store.setDeployError(null);

    try {
      const response = await deploymentsApi.create({
        name,
        provider,
        region: "default",
        vm_size: "medium",
        memory_gb: 4,
        storage_gb: 20,
        yaml_config: yaml,
      });
      store.setDeploymentId(response.deployment.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to initiate deployment";
      store.setDeployError(message);
      store.setIsDeploying(false);
    }
  }

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
          yaml_content: store.yamlContent,
        }),
      });
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveSlug("");
      setSaveDescription("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save template");
    }
  }

  // Auto-generate slug from name
  useEffect(() => {
    if (saveName && !saveSlug) {
      setSaveSlug(
        saveName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      );
    }
  }, [saveName, saveSlug]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Expert Mode</h3>
          <p className="text-sm text-muted-foreground">
            Write or paste your YAML configuration directly
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Back to mode selection
        </Button>
      </div>

      {/* Template picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium shrink-0">Start from:</label>
        <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Blank" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blank">Blank</SelectItem>
            {templates?.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Editor */}
      <SindriYamlEditor value={store.yamlContent} onChange={handleYamlChange} height={480} />

      {/* Error display */}
      {store.deployError && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
          <p className="text-sm text-destructive">{store.deployError}</p>
        </div>
      )}

      {/* Save as Template dialog (inline) */}
      {saveDialogOpen && (
        <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
          <h4 className="text-sm font-medium">Save as Template</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Name</label>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
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
            <label className="text-xs font-medium">Category</label>
            <Select value={saveCategory} onValueChange={setSaveCategory}>
              <SelectTrigger className="mt-1 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ml-ai">ML / AI</SelectItem>
                <SelectItem value="full-stack">Full-Stack</SelectItem>
                <SelectItem value="systems">Systems</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
                <SelectItem value="cloud-native">Cloud Native</SelectItem>
                <SelectItem value="data-engineering">Data Engineering</SelectItem>
              </SelectContent>
            </Select>
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
      <div className="flex items-center justify-between pt-2 border-t">
        <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(!saveDialogOpen)}>
          Save as Template
        </Button>

        {!cliAvailable && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            CLI not configured — deployment unavailable
          </p>
        )}
        <Button
          size="lg"
          onClick={() => void handleDeploy()}
          disabled={!cliAvailable || store.isDeploying || !store.yamlContent.trim()}
          className="min-w-[120px]"
        >
          {store.isDeploying ? (
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
  );
}
