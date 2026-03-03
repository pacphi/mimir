import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WizardStepper, type WizardStep } from "./WizardStepper";
import { Step1NameProvider } from "./guided/Step1NameProvider";
import { Step2ImageVolumes } from "./guided/Step2ImageVolumes";
import { Step3ProfileExtensions } from "./guided/Step3ProfileExtensions";
import { Step4RegionCompute } from "./guided/Step4RegionCompute";
import { Step5Secrets } from "./guided/Step5Secrets";
import { Step6ProviderOptions } from "./guided/Step6ProviderOptions";
import { Step7Review } from "./guided/Step7Review";
import { useDeploymentWizardStore } from "@/stores/deploymentWizardStore";
import { isSystemVolumeConflict, SYSTEM_VOLUME_ERROR } from "@/lib/sindri-constraints";
import { deploymentsApi } from "@/api/deployments";
import { toApiProvider } from "@/types/provider-options";
import { useState } from "react";

const WIZARD_STEPS: WizardStep[] = [
  { id: 1, label: "Name & Provider", description: "Instance name and provider" },
  { id: 2, label: "Image & Volumes", description: "Container image and storage" },
  { id: 3, label: "Profile & Extensions", description: "Profile and extensions" },
  { id: 4, label: "Region & Compute", description: "Region and compute size" },
  { id: 5, label: "Secrets", description: "Environment variables" },
  { id: 6, label: "Provider Options", description: "Provider-specific config" },
  { id: 7, label: "Review & Deploy", description: "Confirm and launch" },
];

function validateStep(
  step: number,
  store: ReturnType<typeof useDeploymentWizardStore.getState>,
): string | null {
  switch (step) {
    case 1: {
      if (!store.name.trim()) return "Please enter an instance name";
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(store.name)) {
        return "Name must be lowercase alphanumeric and hyphens only";
      }
      if (!store.provider) return "Please select a provider";
      return null;
    }
    case 2: {
      // Image & volumes — all optional
      if (store.imageConfig.registry && !/^[\w./:@-]+$/.test(store.imageConfig.registry)) {
        return "Registry must be a valid URL or image path";
      }
      if (store.imageConfig.digest && !/^sha256:[a-f0-9]{64}$/.test(store.imageConfig.digest)) {
        return "Digest must match sha256:<64 hex chars> format";
      }
      for (const vol of store.volumes) {
        if (isSystemVolumeConflict(vol.path)) {
          return SYSTEM_VOLUME_ERROR;
        }
      }
      return null;
    }
    case 3: {
      // draupnir auto-enforced
      return null;
    }
    case 4: {
      if (!store.region) return "Please select a region";
      if (!store.vmSize) return "Please select a compute size";
      return null;
    }
    case 5:
      return null; // Secrets optional
    case 6:
      return null; // Provider options optional
    case 7:
      return null;
    default:
      return null;
  }
}

interface GuidedWizardProps {
  onCancel: () => void;
  onDeployed?: (instanceId: string) => void;
  cliAvailable?: boolean;
}

export function GuidedWizard({ onCancel, cliAvailable = true }: GuidedWizardProps) {
  const store = useDeploymentWizardStore();
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleNext() {
    const storeState = useDeploymentWizardStore.getState();
    const error = validateStep(store.currentStep, storeState);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    store.nextStep();
  }

  function handleBack() {
    setValidationError(null);
    store.prevStep();
  }

  async function handleDeploy() {
    // Recompute YAML first
    store.recomputeYaml();
    const storeState = useDeploymentWizardStore.getState();

    if (!storeState.provider || !storeState.name) {
      store.setDeployError("Missing required fields");
      return;
    }

    store.setIsDeploying(true);
    store.setDeployError(null);

    try {
      const secretsRecord = storeState.secrets.reduce<Record<string, string>>((acc, s) => {
        acc[s.key] = s.value;
        return acc;
      }, {});

      const response = await deploymentsApi.create({
        name: storeState.name,
        provider: toApiProvider(storeState.provider),
        region: storeState.region || "default",
        vm_size: storeState.vmSize || "medium",
        memory_gb: storeState.memoryGb || 4,
        storage_gb: storeState.storageGb || 20,
        yaml_config: storeState.assembledYaml,
        secrets: Object.keys(secretsRecord).length > 0 ? secretsRecord : undefined,
      });

      store.setDeploymentId(response.deployment.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to initiate deployment";
      store.setDeployError(message);
      store.setIsDeploying(false);
    }
  }

  function renderStep() {
    switch (store.currentStep) {
      case 1:
        return <Step1NameProvider />;
      case 2:
        return <Step2ImageVolumes />;
      case 3:
        return <Step3ProfileExtensions />;
      case 4:
        return <Step4RegionCompute />;
      case 5:
        return <Step5Secrets />;
      case 6:
        return <Step6ProviderOptions />;
      case 7:
        return (
          <Step7Review
            onDeploy={() => void handleDeploy()}
            isDeploying={store.isDeploying}
            cliAvailable={cliAvailable}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">New Deployment — Guided</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your deployment step by step
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Back to mode selection
        </Button>
      </div>

      <WizardStepper steps={WIZARD_STEPS} currentStep={store.currentStep} />

      <Card>
        <CardHeader className="pb-4">
          <div>
            <h3 className="font-semibold">
              Step {store.currentStep}: {WIZARD_STEPS[store.currentStep - 1].label}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {WIZARD_STEPS[store.currentStep - 1].description}
            </p>
          </div>
        </CardHeader>

        <CardContent>
          {renderStep()}

          {(validationError || store.deployError) && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
              <p className="text-sm text-destructive">{validationError ?? store.deployError}</p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between border-t pt-4">
          <Button variant="outline" onClick={handleBack} disabled={store.currentStep === 1}>
            Back
          </Button>
          {store.currentStep < 7 && (
            <Button onClick={handleNext}>
              Next
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
