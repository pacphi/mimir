import { useQuery } from "@tanstack/react-query";
import { useDeploymentWizardStore } from "@/stores/deploymentWizardStore";
import { ModeSelector } from "./ModeSelector";
import { GuidedWizard } from "./GuidedWizard";
import { ExpertMode } from "./ExpertMode";
import { DeploymentProgress } from "./DeploymentProgress";
import { registryApi } from "@/api/deployments";
import type { WizardMode } from "@/stores/deploymentWizardStore";

interface DeploymentWizardProps {
  onClose?: () => void;
  onDeployed?: (instanceId: string) => void;
}

export function DeploymentWizard({ onDeployed }: DeploymentWizardProps) {
  const store = useDeploymentWizardStore();

  const { data: cliStatus } = useQuery({
    queryKey: ["registry", "cli-status"],
    queryFn: () => registryApi.getCliStatus(),
    staleTime: 60_000,
    retry: false,
  });
  const cliAvailable = cliStatus?.available ?? true; // optimistic until loaded

  function handleSelectMode(mode: WizardMode) {
    store.reset();
    store.setMode(mode);
  }

  function handleBackToModeSelection() {
    store.reset();
  }

  function handleDeployComplete(instanceId: string) {
    store.setIsDeploying(false);
    onDeployed?.(instanceId);
  }

  function handleDeployError(message: string) {
    store.setDeployError(message);
    store.setIsDeploying(false);
  }

  function handleCancelDeployment() {
    store.setDeploymentId(null);
    store.setIsDeploying(false);
  }

  function handleBackToWizard() {
    store.setDeploymentId(null);
    store.setDeployError(null);
    store.setIsDeploying(false);
    // Return to review step so user can adjust config
    store.setStep(7);
  }

  function handleRetry() {
    store.setDeploymentId(null);
    store.setDeployError(null);
    store.setIsDeploying(false);
    // The GuidedWizard's handleDeploy will be triggered from Step 7
    store.setStep(7);
  }

  const cliBanner = !cliAvailable && (
    <div className="flex gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">
      <svg
        className="w-5 h-5 mt-0.5 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <div>
        <p className="text-sm font-medium">Sindri CLI not configured</p>
        <p className="text-xs mt-0.5 text-amber-700 dark:text-amber-400">
          {cliStatus?.message ??
            "Set SINDRI_BIN_PATH to the sindri binary before starting deployments."}
        </p>
      </div>
    </div>
  );

  // ── Deployment in progress ─────────────────────────────────────────────
  if (store.deploymentId) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Deploying Instance</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {store.deployError
              ? "Deployment failed. Review the logs and try again."
              : "Deployment is in progress. Do not close this window."}
          </p>
        </div>
        <DeploymentProgress
          deploymentId={store.deploymentId}
          onComplete={handleDeployComplete}
          onError={handleDeployError}
          onCancel={handleCancelDeployment}
          onBackToWizard={handleBackToWizard}
          onRetry={handleRetry}
        />
      </div>
    );
  }

  // ── Mode selection ─────────────────────────────────────────────────────
  if (!store.mode) {
    return (
      <div className="space-y-4">
        {cliBanner}
        <ModeSelector onSelect={handleSelectMode} />
      </div>
    );
  }

  // ── Expert mode ────────────────────────────────────────────────────────
  if (store.mode === "expert") {
    return (
      <div className="space-y-4">
        {cliBanner}
        <ExpertMode onCancel={handleBackToModeSelection} cliAvailable={cliAvailable} />
      </div>
    );
  }

  // ── Guided mode ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {cliBanner}
      <GuidedWizard
        onCancel={handleBackToModeSelection}
        onDeployed={onDeployed}
        cliAvailable={cliAvailable}
      />
    </div>
  );
}
