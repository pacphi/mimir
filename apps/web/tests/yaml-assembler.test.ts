import { describe, it, expect } from "vitest";
import { assembleYaml, type AssemblerInput } from "@/lib/yaml-assembler";

const BASE_INPUT: AssemblerInput = {
  name: "test-instance",
  provider: "devpod-aws",
  imageConfig: {},
  imageDefaults: {
    registry: "ghcr.io/sindri",
    version: "latest",
    defaultImage: "sindri:v3-ubuntu-dev",
    isDev: false,
  },
  distro: "ubuntu",
  homeDataSizeGb: 20,
  volumes: [],
  profileName: null,
  profileExtensions: [],
  selectedExtensions: [],
  region: "us-east-1",
  vmSize: "t3.medium",
  memoryGb: 4,
  vcpus: 2,
  storageGb: 50,
  secrets: [],
  providerOptions: {},
};

describe("assembleYaml extensions block", () => {
  it("profile selected, no manual changes → additional: [draupnir] + auto_install", () => {
    const profileExts = ["agent-browser", "agent-manager", "code-editor"];
    const yaml = assembleYaml({
      ...BASE_INPUT,
      profileName: "anthropic-dev",
      profileExtensions: profileExts,
      // selectedExtensions includes profile exts + draupnir (as ensureDraupnir does)
      selectedExtensions: [...profileExts, "draupnir"].sort(),
    });

    expect(yaml).toContain("profile: anthropic-dev");
    expect(yaml).toContain("additional:");
    expect(yaml).toContain("    - draupnir");
    // Profile extensions should NOT appear in additional
    expect(yaml).not.toMatch(/additional:[\s\S]*- agent-browser/);
    expect(yaml).not.toMatch(/additional:[\s\S]*- agent-manager/);
    expect(yaml).not.toMatch(/additional:[\s\S]*- code-editor/);
    expect(yaml).toContain("auto_install: true");
  });

  it("profile + extra extension → additional: [draupnir, monitoring]", () => {
    const profileExts = ["agent-browser", "agent-manager"];
    const yaml = assembleYaml({
      ...BASE_INPUT,
      profileName: "anthropic-dev",
      profileExtensions: profileExts,
      selectedExtensions: [...profileExts, "draupnir", "monitoring"].sort(),
    });

    expect(yaml).toContain("profile: anthropic-dev");
    expect(yaml).toContain("additional:");
    expect(yaml).toContain("    - draupnir");
    expect(yaml).toContain("    - monitoring");
    expect(yaml).not.toMatch(/additional:[\s\S]*- agent-browser/);
    expect(yaml).not.toMatch(/additional:[\s\S]*- agent-manager/);
    expect(yaml).toContain("auto_install: true");
  });

  it("no profile → active: list with draupnir + auto_install", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      profileName: null,
      profileExtensions: [],
      selectedExtensions: ["claudish", "monitoring"],
    });

    expect(yaml).not.toContain("profile:");
    expect(yaml).toContain("active:");
    expect(yaml).toContain("    - claudish");
    expect(yaml).toContain("    - draupnir");
    expect(yaml).toContain("    - monitoring");
    expect(yaml).toContain("auto_install: true");
  });

  it("auto_install: true always present — profile path", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      profileName: "minimal",
      profileExtensions: ["draupnir"],
      selectedExtensions: ["draupnir"],
    });

    expect(yaml).toContain("auto_install: true");
  });

  it("auto_install: true always present — no-profile path", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      profileName: null,
      profileExtensions: [],
      selectedExtensions: [],
    });

    expect(yaml).toContain("auto_install: true");
  });

  it("profile selected, all extensions from profile, no additional block when draupnir is in profile", () => {
    const profileExts = ["agent-browser", "draupnir"];
    const yaml = assembleYaml({
      ...BASE_INPUT,
      profileName: "full",
      profileExtensions: profileExts,
      selectedExtensions: profileExts,
    });

    expect(yaml).toContain("profile: full");
    // No additional block since draupnir is in the profile
    expect(yaml).not.toContain("additional:");
    expect(yaml).toContain("auto_install: true");
  });
});

describe("assembleYaml dev-mode image resolution", () => {
  const DEV_DEFAULTS: AssemblerInput["imageDefaults"] = {
    registry: "ghcr.io/pacphi/sindri",
    version: "latest",
    defaultImage: "sindri:v3-ubuntu-dev",
    isDev: true,
  };

  it("docker (local provider) dev mode → bare local dev image", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      provider: "docker",
      imageDefaults: DEV_DEFAULTS,
    });

    // Docker uses the locally-built dev image
    expect(yaml).toContain("image: sindri:v3-ubuntu-dev");
    expect(yaml).not.toContain("image_config:");
  });

  it("docker dev mode respects distro in bare image name", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      provider: "docker",
      distro: "fedora",
      imageDefaults: DEV_DEFAULTS,
    });

    expect(yaml).toContain("image: sindri:v3-fedora-dev");
  });

  it("fly (cloud provider) dev mode → image_config with registry + distro-aware tag", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      provider: "fly",
      imageDefaults: DEV_DEFAULTS,
    });

    // Cloud providers use image_config with GHCR registry
    expect(yaml).toContain("image_config:");
    expect(yaml).toContain("registry: ghcr.io/pacphi/sindri");
    // Ubuntu is the unsuffixed default
    expect(yaml).toContain("tag_override: latest");
    expect(yaml).not.toMatch(/^\s+image: sindri:/m);
  });

  it("fly dev mode + fedora → distro-suffixed tag_override", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      provider: "fly",
      distro: "fedora",
      imageDefaults: DEV_DEFAULTS,
    });

    expect(yaml).toContain("tag_override: latest-fedora");
  });

  it("fly dev mode + opensuse → distro-suffixed tag_override", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      provider: "fly",
      distro: "opensuse",
      imageDefaults: DEV_DEFAULTS,
    });

    expect(yaml).toContain("tag_override: latest-opensuse");
  });

  it("devpod (cloud provider) dev mode → image_config from registry", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      provider: "devpod-aws",
      imageDefaults: DEV_DEFAULTS,
    });

    expect(yaml).toContain("image_config:");
    expect(yaml).toContain("registry: ghcr.io/pacphi/sindri");
    expect(yaml).toContain("tag_override: latest");
    expect(yaml).not.toMatch(/^\s+image: sindri:/m);
  });

  it("explicit imageConfig overrides dev defaults for any provider", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      provider: "fly",
      imageDefaults: DEV_DEFAULTS,
      imageConfig: { registry: "custom.registry.io/sindri", version: "3.1.0" },
    });

    expect(yaml).toContain("image_config:");
    expect(yaml).toContain("registry: custom.registry.io/sindri");
    expect(yaml).toContain("version: 3.1.0");
    expect(yaml).not.toContain("tag_override:");
  });

  it("prod mode ubuntu → unsuffixed tag_override", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      provider: "fly",
      distro: "ubuntu",
    });

    expect(yaml).toContain("tag_override: latest");
    expect(yaml).not.toContain("latest-ubuntu");
  });

  it("prod mode fedora → distro-suffixed tag_override", () => {
    const yaml = assembleYaml({
      ...BASE_INPUT,
      provider: "fly",
      distro: "fedora",
    });

    expect(yaml).toContain("tag_override: latest-fedora");
  });
});
