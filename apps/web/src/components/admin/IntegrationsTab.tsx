/**
 * Admin integrations tab — shows platform integration status and provider credential reference.
 */

import { useState } from "react";
import { useIntegrations, useProviderCredentialSpecs } from "@/hooks/useIntegrations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, CheckCircle2, XCircle, KeyRound } from "lucide-react";
import { IntegrationKeyEditor } from "./IntegrationKeyEditor";
import type { PlatformIntegrationStatus } from "@/api/integrations";

const CATEGORY_LABELS: Record<string, string> = {
  compute_catalog: "Compute Catalog (Pricing)",
  auth: "Authentication",
  notification: "Notifications",
};

export function IntegrationsTab() {
  const { data: integrations, isLoading: intLoading } = useIntegrations();
  const { data: providers, isLoading: provLoading } = useProviderCredentialSpecs();
  const [editingIntegration, setEditingIntegration] = useState<PlatformIntegrationStatus | null>(
    null,
  );

  if (intLoading || provLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group platform integrations by category
  const grouped = new Map<string, PlatformIntegrationStatus[]>();
  for (const item of integrations?.data ?? []) {
    const list = grouped.get(item.category) ?? [];
    list.push(item);
    grouped.set(item.category, list);
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      {/* Section 1: Platform Integrations */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Platform Integrations</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Server-level credentials that enable optional features. Managed by the operator via
          environment variables or the secrets vault.
        </p>

        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category} className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              {CATEGORY_LABELS[category] ?? category}
            </h3>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
                >
                  {item.configured ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.description}
                      {" · "}
                      <code className="font-mono">{item.envVarName}</code>
                    </div>
                  </div>
                  {item.category === "compute_catalog" && !item.configured && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs shrink-0"
                      onClick={() => setEditingIntegration(item)}
                    >
                      <KeyRound className="h-3.5 w-3.5 mr-1" />
                      Set via Vault
                    </Button>
                  )}
                  <Badge
                    variant={item.configured ? "default" : "secondary"}
                    className="text-xs shrink-0"
                  >
                    {item.configured ? "Configured" : "Not configured"}
                  </Badge>
                  {item.setupUrl && (
                    <a
                      href={item.setupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title="Setup instructions"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Section 2: Provider Credentials Reference */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Provider Credentials Reference</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Credentials users must supply in the deployment wizard (Step 5) for each provider. These
          are per-deployment, not server-level.
        </p>

        <div className="space-y-2">
          {(providers?.data ?? []).map((spec) => (
            <div key={spec.providerId} className="rounded-md border px-4 py-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{spec.name}</span>
                {spec.setupUrl && (
                  <a
                    href={spec.setupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Where to get credentials"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              <div className="text-xs text-muted-foreground mb-1">{spec.description}</div>
              {spec.requiredEnvVars.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {spec.requiredEnvVars.map((v) => (
                    <code key={v} className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {v}
                    </code>
                  ))}
                  {spec.optionalEnvVars?.map((v) => (
                    <code
                      key={v}
                      className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground"
                      title="Optional"
                    >
                      {v}?
                    </code>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  {spec.notes ?? "No credentials required"}
                </span>
              )}
              {spec.notes && spec.requiredEnvVars.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1 italic">{spec.notes}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Key editor modal */}
      {editingIntegration && (
        <IntegrationKeyEditor
          integration={editingIntegration}
          onClose={() => setEditingIntegration(null)}
        />
      )}
    </div>
  );
}
