import { useDeploymentWizardStore } from "@/stores/deploymentWizardStore";
import { PROVIDER_CATALOG } from "@/types/provider-options";
import { providerOptionsComponents } from "./provider-options";

export function Step6ProviderOptions() {
  const { provider, providerOptions, updateProviderOption, setProviderOptions } =
    useDeploymentWizardStore();

  if (!provider) {
    return <p className="text-sm text-muted-foreground">No provider selected.</p>;
  }

  const providerMeta = PROVIDER_CATALOG.find((p) => p.id === provider);
  const OptionsComponent = providerOptionsComponents[provider];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{providerMeta?.name ?? provider} Options</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Provider-specific configuration. All fields are optional.
        </p>
      </div>

      {OptionsComponent ? (
        <OptionsComponent
          options={providerOptions}
          onChange={updateProviderOption}
          setOptions={setProviderOptions}
        />
      ) : (
        <div className="rounded-md border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No additional options for this provider.</p>
        </div>
      )}
    </div>
  );
}
