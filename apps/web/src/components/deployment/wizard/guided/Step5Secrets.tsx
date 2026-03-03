import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDeploymentWizardStore } from "@/stores/deploymentWizardStore";
import { useProviderCredentials } from "@/hooks/useIntegrations";

// ─── .env parser ────────────────────────────────────────────────────────────

function parseEnvFile(content: string): Array<{ key: string; value: string }> {
  const results: Array<{ key: string; value: string }> = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) results.push({ key, value });
  }
  return results;
}

// ─── Eye toggle icons ───────────────────────────────────────────────────────

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function Step5Secrets() {
  const { secrets, addSecret, removeSecret, setSecrets, provider } = useDeploymentWizardStore();
  const { data: credSpec } = useProviderCredentials(provider ?? undefined);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newValueVisible, setNewValueVisible] = useState(false);
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleAdd() {
    if (!newKey.trim() || !newValue.trim()) return;
    addSecret(newKey.trim(), newValue.trim());
    setNewKey("");
    setNewValue("");
    setNewValueVisible(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  function toggleVisibility(index: number) {
    setVisibleIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  // ── File handling ─────────────────────────────────────────────────────

  const handleFileContent = useCallback(
    (content: string) => {
      const parsed = parseEnvFile(content);
      if (parsed.length === 0) return;
      // Merge: add new keys, update existing
      const existing = new Map(secrets.map((s) => [s.key, s.value]));
      for (const { key, value } of parsed) {
        existing.set(key, value);
      }
      setSecrets(Array.from(existing.entries()).map(([key, value]) => ({ key, value })));
    },
    [secrets, setSecrets],
  );

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleFileContent(reader.result as string);
    reader.readAsText(file);
    // Reset so same file can be re-uploaded
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleFileContent(reader.result as string);
    reader.readAsText(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-1">Environment Secrets</h3>
        <CardDescription className="text-xs">
          Add environment variables and secrets. Values are encrypted at rest and never logged. This
          step is optional.
        </CardDescription>
      </div>

      {/* Provider credential checklist */}
      {credSpec && credSpec.requiredEnvVars.length > 0 && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium">Required for {credSpec.name} deployment</h4>
            {credSpec.setupUrl && (
              <a
                href={credSpec.setupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Get credentials
              </a>
            )}
          </div>
          <div className="space-y-1">
            {credSpec.requiredEnvVars.map((envVar) => {
              const isProvided = secrets.some((s) => s.key === envVar);
              return (
                <div key={envVar} className="flex items-center gap-2 text-xs">
                  <div
                    className={cn(
                      "w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0",
                      isProvided
                        ? "border-green-500 bg-green-500/20"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {isProvided && (
                      <svg
                        className="w-2.5 h-2.5 text-green-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <code
                    className={cn(
                      "font-mono",
                      isProvided ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {envVar}
                  </code>
                </div>
              );
            })}
          </div>
          {credSpec.notes && (
            <p className="text-[10px] text-muted-foreground italic">{credSpec.notes}</p>
          )}
        </div>
      )}

      {/* Drop zone for .env file */}
      <div
        className={cn(
          "rounded-md border-2 border-dashed p-4 text-center transition-colors cursor-pointer",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-muted-foreground/50",
        )}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".env,.env.*,text/plain"
          className="hidden"
          onChange={handleFileSelect}
        />
        <svg
          className="w-6 h-6 mx-auto text-muted-foreground mb-1.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-xs font-medium text-muted-foreground">
          Drop a <code className="font-mono">.env</code> file here or click to browse
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          KEY=VALUE pairs will be imported automatically
        </p>
      </div>

      {/* Existing secrets list */}
      {secrets.length > 0 && (
        <div className="space-y-2">
          {secrets.map((secret, index) => {
            const isVisible = visibleIndices.has(index);
            return (
              <div
                key={index}
                className="flex items-center gap-2 p-2 rounded-md border border-input bg-background"
              >
                <code className="text-xs font-mono w-40 shrink-0 truncate">{secret.key}</code>
                <div className="flex-1 relative">
                  <code className="text-xs font-mono text-muted-foreground block truncate pr-7">
                    {isVisible ? secret.value : "*".repeat(Math.min(secret.value.length, 20))}
                  </code>
                  <button
                    type="button"
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => toggleVisibility(index)}
                    aria-label={isVisible ? "Hide value" : "Show value"}
                  >
                    {isVisible ? (
                      <EyeOffIcon className="w-3.5 h-3.5" />
                    ) : (
                      <EyeIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    removeSecret(index);
                    setVisibleIndices((prev) => {
                      const next = new Set<number>();
                      for (const i of prev) {
                        if (i < index) next.add(i);
                        else if (i > index) next.add(i - 1);
                      }
                      return next;
                    });
                  }}
                  aria-label={`Remove ${secret.key}`}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual add row */}
      <div className="flex gap-2">
        <Input
          placeholder="SECRET_KEY"
          className="font-mono text-sm flex-1"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
        />
        <div className="relative flex-1">
          <Input
            placeholder="value"
            className="font-mono text-sm pr-8"
            type={newValueVisible ? "text" : "password"}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {newValue && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setNewValueVisible(!newValueVisible)}
              aria-label={newValueVisible ? "Hide value" : "Show value"}
            >
              {newValueVisible ? (
                <EyeOffIcon className="w-4 h-4" />
              ) : (
                <EyeIcon className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
        <Button variant="outline" onClick={handleAdd} disabled={!newKey.trim() || !newValue.trim()}>
          Add
        </Button>
      </div>

      {secrets.length === 0 && (
        <p className="text-xs text-muted-foreground text-center">No secrets configured yet.</p>
      )}
    </div>
  );
}
