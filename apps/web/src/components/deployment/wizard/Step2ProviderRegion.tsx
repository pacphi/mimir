import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { DeploymentConfig } from "@/types/deployment";

interface Step2ProviderRegionProps {
  config: DeploymentConfig;
  onChange: (updates: Partial<DeploymentConfig>) => void;
}

export function Step2ProviderRegion({ config, onChange }: Step2ProviderRegionProps) {
  const { data: regionsData } = useQuery({
    queryKey: ["providers", config.provider, "regions"],
    queryFn: () =>
      fetch(`/api/v1/providers/${config.provider}/regions`, {
        headers: { "Content-Type": "application/json" },
      })
        .then((r) => r.json())
        .then(
          (d: { regions: Array<{ id: string; name: string; location: string }> }) => d.regions,
        ),
    enabled: Boolean(config.provider),
    staleTime: 300_000,
  });

  const availableRegions = regionsData ?? [];

  // Auto-select first region when regions load or provider changes
  useEffect(() => {
    if (availableRegions.length > 0 && !availableRegions.find((r) => r.id === config.region)) {
      onChange({ region: availableRegions[0]?.id ?? "" });
    }
    // onChange is stable (wrapped in useCallback in parent); omitting to avoid stale-closure loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableRegions, config.region]);

  return (
    <div className="space-y-6">
      {/* Read-only provider badge */}
      <div>
        <h3 className="text-sm font-medium mb-2">Deploying to</h3>
        <div className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <div className="w-5 h-5 rounded text-xs font-bold bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            {config.provider[0]?.toUpperCase() ?? "?"}
          </div>
          <span className="text-sm font-medium capitalize">{config.provider}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Provider was selected in Step 1. Go back to change it.
        </p>
      </div>

      {/* Region selector */}
      {availableRegions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Select Region</h3>
          <div className="grid grid-cols-3 gap-2">
            {availableRegions.map((region) => (
              <button
                key={region.id}
                type="button"
                className={cn(
                  "rounded-md border p-3 text-left transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring",
                  config.region === region.id
                    ? "border-primary bg-primary/5"
                    : "border-input bg-background",
                )}
                onClick={() => onChange({ region: region.id })}
              >
                <p className="text-sm font-medium">{region.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{region.location}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{region.id}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {!config.provider && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No provider selected. Go back to Step 1 to choose a provider.
        </p>
      )}

      {config.provider && availableRegions.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Loading regions…</p>
      )}
    </div>
  );
}
