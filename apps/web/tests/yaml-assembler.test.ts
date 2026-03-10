import { describe, it, expect } from "vitest";
import { assembleYaml, type AssemblerInput } from "@/lib/yaml-assembler";

const BASE_INPUT: AssemblerInput = {
  name: "test-instance",
  provider: "devpod-aws",
  imageConfig: {},
  imageDefaults: { registry: "ghcr.io/sindri", version: "latest" },
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
