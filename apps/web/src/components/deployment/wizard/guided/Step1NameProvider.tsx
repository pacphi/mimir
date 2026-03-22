import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useDeploymentWizardStore } from "@/stores/deploymentWizardStore";
import { PROVIDER_CATALOG, type ProviderId, catalogProviderFor } from "@/types/provider-options";
import { ProviderIcon, DevPodIcon } from "./ProviderIcons";
import { providersApi } from "@/api/deployments";

export function Step1NameProvider() {
  const { name, provider, setName, setProvider } = useDeploymentWizardStore();

  const { data: availabilityData } = useQuery({
    queryKey: ["providers", "availability"],
    queryFn: () => providersApi.getAvailability(),
    staleTime: 5 * 60 * 1000,
  });

  const availability = availabilityData?.availability;

  /** Check if a provider's pricing service is available. */
  function isProviderAvailable(providerId: ProviderId): boolean {
    if (!availability) return true; // optimistic while loading
    const catalogProvider = catalogProviderFor(providerId);
    const entry = availability[catalogProvider];
    return entry?.available ?? true;
  }

  /** Get the reason a provider is unavailable. */
  function getUnavailableReason(providerId: ProviderId): string | undefined {
    if (!availability) return undefined;
    const catalogProvider = catalogProviderFor(providerId);
    const entry = availability[catalogProvider];
    if (entry?.available === false) {
      return `${PROVIDER_CATALOG.find((p) => p.id === providerId)?.name ?? providerId} pricing credentials are not configured. Contact your administrator to enable this provider.`;
    }
    return undefined;
  }

  return (
    <div className="space-y-6">
      {/* Deployment Name */}
      <div>
        <label className="text-sm font-medium" htmlFor="deployment-name">
          Instance Name <span className="text-destructive">*</span>
        </label>
        <Input
          id="deployment-name"
          className="mt-1.5"
          placeholder="my-instance"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Lowercase letters, numbers, and hyphens only
        </p>
      </div>

      {/* Provider Grid */}
      <div>
        <h3 className="text-sm font-medium mb-3">
          Provider <span className="text-destructive">*</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PROVIDER_CATALOG.map((p) => {
            const isDevpod = p.id.startsWith("devpod-");
            const isSelected = provider === p.id;
            const available = isProviderAvailable(p.id);
            const reason = getUnavailableReason(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={!available}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                  !available
                    ? "border-input bg-muted/30 opacity-50 cursor-not-allowed"
                    : isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-input bg-background hover:border-primary",
                )}
                title={available ? p.description : reason}
                onClick={() => available && setProvider(p.id as ProviderId)}
              >
                <div className="relative mb-2">
                  <div className="flex items-center gap-1.5">
                    {isDevpod && (
                      <div
                        className={cn(
                          "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
                          !available
                            ? "bg-muted text-muted-foreground/50"
                            : isSelected
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        <DevPodIcon size={18} />
                      </div>
                    )}
                    <div
                      className={cn(
                        "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
                        !available
                          ? "bg-muted text-muted-foreground/50"
                          : isSelected
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      <ProviderIcon providerId={p.id} size={18} />
                    </div>
                  </div>
                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-primary absolute top-0 right-0"
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
                <p
                  className={cn(
                    "text-sm font-medium leading-tight",
                    !available && "text-muted-foreground",
                  )}
                >
                  {p.name}
                </p>
                {!available && (
                  <p className="text-[10px] text-amber-500 mt-0.5 leading-tight">
                    Credentials required
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
