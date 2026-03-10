import { create } from "zustand";
import type { ProviderId } from "@/types/provider-options";
import type { DeploymentSecret } from "@/types/deployment";
import {
  assembleYaml,
  type ImageConfig,
  type ImageDefaults,
  type VolumeEntry,
} from "@/lib/yaml-assembler";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WizardMode = "guided" | "expert" | null;

export interface DeploymentWizardState {
  // Mode
  mode: WizardMode;
  currentStep: number;

  // Step 1 — Name & Provider
  name: string;
  provider: ProviderId | null;

  // Step 2 — Image & Volumes
  imageConfig: ImageConfig;
  homeDataSizeGb: number;
  volumes: VolumeEntry[];

  // Step 3 — Profile & Extensions
  profileName: string | null;
  profileExtensions: string[];
  selectedExtensions: string[];

  // Step 4 — Region & Compute
  region: string;
  vmSize: string;
  memoryGb: number;
  storageGb: number;
  vcpus: number;

  // Step 5 — Secrets
  secrets: DeploymentSecret[];

  // Step 6 — Provider Options
  providerOptions: Record<string, unknown>;

  // Expert mode
  yamlContent: string;

  // Computed (guided)
  assembledYaml: string;

  // Deployment state
  isDeploying: boolean;
  deploymentId: string | null;
  deployError: string | null;
}

export interface DeploymentWizardActions {
  // Mode
  setMode: (mode: WizardMode) => void;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Step 1
  setName: (name: string) => void;
  setProvider: (provider: ProviderId) => void;

  // Step 2
  setImageConfig: (config: Partial<ImageConfig>) => void;
  setHomeDataSizeGb: (gb: number) => void;
  setVolumes: (volumes: VolumeEntry[]) => void;
  addVolume: () => void;
  removeVolume: (index: number) => void;
  updateVolume: (index: number, updates: Partial<VolumeEntry>) => void;

  // Step 3
  setProfileName: (name: string | null) => void;
  setProfileExtensions: (extensions: string[]) => void;
  setSelectedExtensions: (extensions: string[]) => void;
  toggleExtension: (ext: string) => void;

  // Step 4
  setRegion: (region: string) => void;
  setVmSize: (vmSize: string) => void;
  setMemoryGb: (gb: number) => void;
  setStorageGb: (gb: number) => void;
  setVcpus: (vcpus: number) => void;
  setCompute: (compute: {
    vmSize: string;
    memoryGb: number;
    storageGb: number;
    vcpus: number;
  }) => void;

  // Step 5
  setSecrets: (secrets: DeploymentSecret[]) => void;
  addSecret: (key: string, value: string) => void;
  removeSecret: (index: number) => void;

  // Step 6
  setProviderOptions: (options: Record<string, unknown>) => void;
  updateProviderOption: (key: string, value: unknown) => void;

  // Expert
  setYamlContent: (yaml: string) => void;

  // Deploy
  setIsDeploying: (v: boolean) => void;
  setDeploymentId: (id: string | null) => void;
  setDeployError: (error: string | null) => void;

  // Recompute assembled YAML (imageDefaults from app config)
  recomputeYaml: (imageDefaults: ImageDefaults) => void;

  // Reset
  reset: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_STATE: DeploymentWizardState = {
  mode: null,
  currentStep: 1,
  name: "",
  provider: null,
  imageConfig: {},
  homeDataSizeGb: 20,
  volumes: [],
  profileName: null,
  profileExtensions: [],
  selectedExtensions: [],
  region: "",
  vmSize: "",
  memoryGb: 0,
  storageGb: 0,
  vcpus: 0,
  secrets: [],
  providerOptions: {},
  yamlContent: "",
  assembledYaml: "",
  isDeploying: false,
  deploymentId: null,
  deployError: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

function computeYaml(state: DeploymentWizardState, imageDefaults: ImageDefaults): string {
  if (!state.provider || !state.name) return "";
  return assembleYaml({
    name: state.name,
    provider: state.provider,
    imageConfig: state.imageConfig,
    imageDefaults,
    homeDataSizeGb: state.homeDataSizeGb,
    volumes: state.volumes,
    profileName: state.profileName,
    profileExtensions: state.profileExtensions,
    selectedExtensions: state.selectedExtensions,
    region: state.region,
    vmSize: state.vmSize,
    memoryGb: state.memoryGb,
    vcpus: state.vcpus,
    storageGb: state.storageGb,
    secrets: state.secrets,
    providerOptions: state.providerOptions,
  });
}

export const useDeploymentWizardStore = create<DeploymentWizardState & DeploymentWizardActions>(
  (set) => ({
    ...INITIAL_STATE,

    // ── Mode ──────────────────────────────────────────────────────────────
    setMode: (mode) => set({ mode }),
    setStep: (step) => set({ currentStep: step }),
    nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, 7) })),
    prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) })),

    // ── Step 1 ────────────────────────────────────────────────────────────
    setName: (name) => set({ name }),
    setProvider: (provider) =>
      set({
        provider,
        region: "",
        vmSize: "",
        memoryGb: 0,
        storageGb: 0,
        vcpus: 0,
        providerOptions: {},
      }),

    // ── Step 2 ────────────────────────────────────────────────────────────
    setImageConfig: (config) => set((s) => ({ imageConfig: { ...s.imageConfig, ...config } })),
    setHomeDataSizeGb: (homeDataSizeGb) => set({ homeDataSizeGb }),
    setVolumes: (volumes) => set({ volumes }),
    addVolume: () => set((s) => ({ volumes: [...s.volumes, { name: "", path: "", size: "" }] })),
    removeVolume: (index) => set((s) => ({ volumes: s.volumes.filter((_, i) => i !== index) })),
    updateVolume: (index, updates) =>
      set((s) => ({
        volumes: s.volumes.map((v, i) => (i === index ? { ...v, ...updates } : v)),
      })),

    // ── Step 3 ────────────────────────────────────────────────────────────
    setProfileName: (profileName) => set({ profileName }),
    setProfileExtensions: (profileExtensions) => set({ profileExtensions }),
    setSelectedExtensions: (selectedExtensions) => set({ selectedExtensions }),
    toggleExtension: (ext) =>
      set((s) => {
        const has = s.selectedExtensions.includes(ext);
        return {
          selectedExtensions: has
            ? s.selectedExtensions.filter((e) => e !== ext)
            : [...s.selectedExtensions, ext].sort(),
        };
      }),

    // ── Step 4 ────────────────────────────────────────────────────────────
    setRegion: (region) => set({ region }),
    setVmSize: (vmSize) => set({ vmSize }),
    setMemoryGb: (memoryGb) => set({ memoryGb }),
    setStorageGb: (storageGb) => set({ storageGb }),
    setVcpus: (vcpus) => set({ vcpus }),
    setCompute: (compute) => set(compute),

    // ── Step 5 ────────────────────────────────────────────────────────────
    setSecrets: (secrets) => set({ secrets }),
    addSecret: (key, value) => set((s) => ({ secrets: [...s.secrets, { key, value }] })),
    removeSecret: (index) => set((s) => ({ secrets: s.secrets.filter((_, i) => i !== index) })),

    // ── Step 6 ────────────────────────────────────────────────────────────
    setProviderOptions: (options) => set({ providerOptions: options }),
    updateProviderOption: (key, value) =>
      set((s) => ({ providerOptions: { ...s.providerOptions, [key]: value } })),

    // ── Expert ────────────────────────────────────────────────────────────
    setYamlContent: (yaml) => set({ yamlContent: yaml }),

    // ── Deploy ────────────────────────────────────────────────────────────
    setIsDeploying: (v) => set({ isDeploying: v }),
    setDeploymentId: (id) => set({ deploymentId: id }),
    setDeployError: (error) => set({ deployError: error }),

    // ── YAML ──────────────────────────────────────────────────────────────
    recomputeYaml: (imageDefaults) =>
      set((s) => ({ assembledYaml: computeYaml(s, imageDefaults) })),

    // ── Reset ─────────────────────────────────────────────────────────────
    reset: () => set(INITIAL_STATE),
  }),
);
