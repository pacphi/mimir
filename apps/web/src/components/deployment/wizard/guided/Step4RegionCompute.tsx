import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDeploymentWizardStore } from "@/stores/deploymentWizardStore";
import { providersApi } from "@/api/deployments";
import { catalogProviderFor, PROVIDERS_WITHOUT_REGION } from "@/types/provider-options";
import { HOME_DATA_MIN_SIZE_GB } from "@/lib/sindri-constraints";
import type { ComputeSize } from "@/types/deployment";

// ─── Reusable scroll container with up/down indicators ──────────────────────

function ScrollBox({
  maxHeight,
  scrollStep,
  children,
  deps,
}: {
  maxHeight: number;
  scrollStep: number;
  children: React.ReactNode;
  deps?: unknown;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateIndicators = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateIndicators();
    el.addEventListener("scroll", updateIndicators, { passive: true });
    const ro = new ResizeObserver(updateIndicators);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateIndicators);
      ro.disconnect();
    };
  }, [updateIndicators, deps]);

  function scrollBy(delta: number) {
    scrollRef.current?.scrollBy({ top: delta, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => scrollBy(-scrollStep)}
        className={cn(
          "flex items-center justify-center w-full h-6 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all rounded-md",
          canScrollUp ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-label="Scroll up"
        tabIndex={canScrollUp ? 0 : -1}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <div ref={scrollRef} className="overflow-y-auto scrollbar-none" style={{ maxHeight }}>
        {children}
      </div>
      <button
        type="button"
        onClick={() => scrollBy(scrollStep)}
        className={cn(
          "flex items-center justify-center w-full h-6 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all rounded-md",
          canScrollDown ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-label="Scroll down"
        tabIndex={canScrollDown ? 0 : -1}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}

// ─── Region Selector ────────────────────────────────────────────────────────

function RegionSelector({
  regions,
  selectedRegion,
  onSelect,
}: {
  regions: Array<{ id: string; name: string; location: string }>;
  selectedRegion: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium mb-3">
        Region <span className="text-destructive">*</span>
      </h3>
      {regions.length > 0 ? (
        <ScrollBox maxHeight={176} scrollStep={88} deps={regions}>
          <div className="grid grid-cols-3 gap-2">
            {regions.map((region) => (
              <button
                key={region.id}
                type="button"
                className={cn(
                  "rounded-md border p-3 text-left transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring",
                  selectedRegion === region.id
                    ? "border-primary bg-primary/5"
                    : "border-input bg-background",
                )}
                onClick={() => onSelect(region.id)}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="text-sm font-medium">{region.name}</p>
                  {selectedRegion === region.id && (
                    <svg
                      className="w-4 h-4 text-primary shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{region.location}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{region.id}</p>
              </button>
            ))}
          </div>
        </ScrollBox>
      ) : (
        <p className="text-sm text-muted-foreground">Loading regions...</p>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function Step4RegionCompute() {
  const store = useDeploymentWizardStore();
  const provider = store.provider;

  // Resolve which provider endpoint to fetch regions/catalog from
  const catalogProvider = provider ? catalogProviderFor(provider) : "";

  // Fetch regions — use catalogProvider so devpod-digitalocean → /providers/digitalocean/regions
  const { data: regionsData } = useQuery({
    queryKey: ["providers", catalogProvider, "regions"],
    queryFn: () =>
      fetch(`/api/v1/providers/${catalogProvider}/regions`, {
        headers: { "Content-Type": "application/json" },
      })
        .then((r) => r.json())
        .then((d: { regions: Array<{ id: string; name: string; location: string }> }) => d.regions),
    enabled: Boolean(catalogProvider),
    staleTime: 300_000,
  });

  const regions = regionsData ?? [];

  // Auto-select first region
  useEffect(() => {
    if (regions.length > 0 && !regions.find((r) => r.id === store.region)) {
      store.setRegion(regions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, store.region]);

  // Fetch compute catalog
  const {
    data: catalog,
    isLoading: catalogLoading,
    isError: catalogError,
  } = useQuery({
    queryKey: ["compute-catalog", catalogProvider, store.region],
    queryFn: () => providersApi.getComputeCatalog(catalogProvider, store.region || undefined),
    enabled: Boolean(catalogProvider),
    staleTime: 5 * 60 * 1000,
  });

  const sizes = catalog?.sizes ?? [];
  const cpuSizes = sizes.filter((s) => s.category === "cpu");
  const gpuSizes = sizes.filter((s) => s.category === "gpu");

  function handleSelectSize(size: ComputeSize) {
    // If the user explicitly increased home_data volume size in Step 2,
    // that takes precedence over the compute option's bundled storage.
    const userOverrodeVolume = store.homeDataSizeGb > HOME_DATA_MIN_SIZE_GB;
    const storageGb = userOverrodeVolume
      ? Math.max(store.homeDataSizeGb, size.storage_gb)
      : size.storage_gb;

    store.setCompute({
      vmSize: size.id,
      memoryGb: size.memory_gb,
      storageGb,
      vcpus: size.vcpus,
    });
  }

  function formatPrice(size: ComputeSize): string {
    if (size.price_source === "none") return "Free (local)";
    if (size.price_per_hour === 0) return "Free";
    return `$${size.price_per_hour.toFixed(3)}/hr`;
  }

  function renderSizeCard(size: ComputeSize) {
    return (
      <button
        key={size.id}
        type="button"
        className={cn(
          "rounded-md border p-3 text-left transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring",
          store.vmSize === size.id ? "border-primary bg-primary/5" : "border-input bg-background",
        )}
        onClick={() => handleSelectSize(size)}
      >
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-medium truncate">{size.name}</p>
          <div className="flex items-center gap-1 shrink-0">
            {size.availability === "low" && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                Low stock
              </Badge>
            )}
            {size.availability === "none" && (
              <Badge variant="error" className="text-[10px] px-1.5 py-0">
                Unavailable
              </Badge>
            )}
            {store.vmSize === size.id && (
              <svg
                className="w-4 h-4 text-primary shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {[
            size.vcpus > 0 ? `${size.vcpus} vCPU${size.vcpus !== 1 ? "s" : ""}` : null,
            size.memory_gb > 0 ? `${size.memory_gb} GB RAM` : null,
            size.storage_gb > 0 ? `${size.storage_gb} GB` : null,
            size.gpu_name ? `${size.gpu_count ?? 1}x ${size.gpu_name}` : null,
            size.gpu_memory_gb ? `${size.gpu_memory_gb} GB VRAM` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{formatPrice(size)}</p>
      </button>
    );
  }

  function renderSizeGrid(label: string, items: ComputeSize[]) {
    if (items.length === 0) return null;
    return (
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          {label}
        </h4>
        <div className="grid grid-cols-2 gap-3">{items.map(renderSizeCard)}</div>
      </div>
    );
  }

  const regionNotice = provider ? PROVIDERS_WITHOUT_REGION[provider] : undefined;

  return (
    <div className="space-y-6">
      {/* Region selector — or info callout for providers that don't use regions */}
      {regionNotice ? (
        <div>
          <h3 className="text-sm font-medium mb-3">Region</h3>
          <div className="p-3 text-sm text-muted-foreground bg-muted/30 rounded-md border border-input flex gap-2">
            <svg
              className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z"
              />
            </svg>
            <p>{regionNotice}</p>
          </div>
        </div>
      ) : (
        <RegionSelector
          regions={regions}
          selectedRegion={store.region}
          onSelect={(id) => store.setRegion(id)}
        />
      )}

      {/* Compute sizes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">
            Compute Size <span className="text-destructive">*</span>
          </h3>
          {catalog && (
            <span className="text-[10px] text-muted-foreground">
              {`Pricing: ${catalog.source}`}
            </span>
          )}
        </div>

        {catalogError && (
          <div className="mb-3 p-3 text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-md border border-amber-500/20">
            <p className="font-medium">Pricing data unavailable</p>
            <p className="text-xs mt-1">
              Unable to fetch compute pricing from the provider. This may be due to a temporary API
              outage or missing credentials. Please try again later or contact your administrator.
            </p>
          </div>
        )}

        {!catalogLoading && !catalogError && sizes.length === 0 && (
          <div className="mb-3 p-3 text-sm text-muted-foreground bg-muted/30 rounded-md border border-input">
            <p className="font-medium">No compute sizes available</p>
            <p className="text-xs mt-1">
              No pricing data is currently available for this provider and region. The catalog may
              not have been populated yet.
            </p>
          </div>
        )}

        {catalogLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-lg border border-input bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <ScrollBox maxHeight={176} scrollStep={88} deps={sizes}>
            <div className="space-y-4">
              {gpuSizes.length > 0 ? (
                <>
                  {renderSizeGrid("CPU Instances", cpuSizes)}
                  {renderSizeGrid("GPU Instances", gpuSizes)}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">{sizes.map(renderSizeCard)}</div>
              )}
            </div>
          </ScrollBox>
        )}
      </div>
    </div>
  );
}
