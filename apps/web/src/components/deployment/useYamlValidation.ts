import { useState, useEffect, useCallback } from "react";
import type { ValidationResult, ValidationError } from "./YamlValidator";
import { parseSimpleYaml, type ParsedSindriConfig } from "@/lib/yaml-parser";
import { isSystemVolumeConflict, SYSTEM_VOLUME_ERROR } from "@/lib/sindri-constraints";

function validateSindriConfig(config: ParsedSindriConfig, yamlLines: string[]): ValidationError[] {
  const errors: ValidationError[] = [];

  const findLine = (key: string): number | undefined => {
    const idx = yamlLines.findIndex((l) => l.trim().startsWith(`${key}:`));
    return idx >= 0 ? idx + 1 : undefined;
  };

  // Required top-level fields
  if (!config.version) {
    errors.push({
      severity: "error",
      message: 'Missing required field "version"',
      path: "version",
      line: findLine("version"),
    });
  } else if (typeof config.version !== "string" || !/^\d+\.\d+$/.test(String(config.version))) {
    errors.push({
      severity: "error",
      message: 'Field "version" must match pattern "\\d+.\\d+" (e.g. "1.0")',
      path: "version",
      line: findLine("version"),
    });
  }

  if (!config.name) {
    errors.push({
      severity: "error",
      message: 'Missing required field "name"',
      path: "name",
      line: findLine("name"),
    });
  } else if (!/^[a-z][a-z0-9-]*$/.test(String(config.name))) {
    errors.push({
      severity: "error",
      message:
        'Field "name" must start with a lowercase letter and contain only lowercase letters, digits, and hyphens',
      path: "name",
      line: findLine("name"),
    });
  }

  if (!config.deployment) {
    errors.push({
      severity: "error",
      message: 'Missing required field "deployment"',
      path: "deployment",
      line: findLine("deployment"),
    });
  } else {
    const validProviders = [
      "fly",
      "kubernetes",
      "docker-compose",
      "docker",
      "devpod",
      "e2b",
      "runpod",
      "northflank",
    ];
    if (!config.deployment.provider) {
      errors.push({
        severity: "error",
        message: 'Missing required field "deployment.provider"',
        path: "deployment.provider",
        line: findLine("provider"),
      });
    } else if (!validProviders.includes(String(config.deployment.provider))) {
      errors.push({
        severity: "error",
        message: `Invalid provider "${config.deployment.provider}". Must be one of: ${validProviders.join(", ")}`,
        path: "deployment.provider",
        line: findLine("provider"),
      });
    }

    if (config.deployment?.volumes && typeof config.deployment.volumes === "object") {
      const vols = config.deployment.volumes as Record<string, unknown>;
      for (const [volName, volDef] of Object.entries(vols)) {
        if (typeof volDef === "object" && volDef !== null) {
          const path = String((volDef as Record<string, unknown>).path ?? "");
          if (path && isSystemVolumeConflict(path)) {
            errors.push({
              severity: "error",
              message: SYSTEM_VOLUME_ERROR,
              path: `deployment.volumes.${volName}.path`,
              line: findLine("path"),
            });
          }
        }
      }
    }
  }

  if (!config.extensions) {
    errors.push({
      severity: "error",
      message: 'Missing required field "extensions"',
      path: "extensions",
      line: findLine("extensions"),
    });
  } else {
    const ext = config.extensions;
    const hasProfile = ext.profile !== undefined;
    const hasActive = ext.active !== undefined;

    if (!hasProfile && !hasActive) {
      errors.push({
        severity: "error",
        message: 'Field "extensions" must have either "profile" or "active"',
        path: "extensions",
        line: findLine("extensions"),
      });
    }

    if (hasProfile && hasActive) {
      errors.push({
        severity: "error",
        message: 'Fields "extensions.profile" and "extensions.active" are mutually exclusive',
        path: "extensions",
        line: findLine("profile"),
      });
    }

    if (hasActive && ext.additional) {
      errors.push({
        severity: "error",
        message:
          'Field "extensions.additional" cannot be used with "extensions.active" (only with profile)',
        path: "extensions.additional",
        line: findLine("additional"),
      });
    }

    if (hasProfile) {
      const validProfiles = [
        "minimal",
        "fullstack",
        "anthropic-dev",
        "systems",
        "enterprise",
        "devops",
        "mobile",
        "visionflow-core",
        "visionflow-data-scientist",
        "visionflow-creative",
        "visionflow-full",
      ];
      if (!validProfiles.includes(String(ext.profile))) {
        errors.push({
          severity: "error",
          message: `Invalid profile "${ext.profile}". Must be one of: ${validProfiles.join(", ")}`,
          path: "extensions.profile",
          line: findLine("profile"),
        });
      }
    }
  }

  return errors;
}

export interface YamlValidationOptions {
  debounceMs?: number;
}

export function useYamlValidation(
  yaml: string,
  options: YamlValidationOptions = {},
): ValidationResult {
  const { debounceMs = 300 } = options;
  const [result, setResult] = useState<ValidationResult>({ valid: true, errors: [] });

  const validate = useCallback((input: string): ValidationResult => {
    if (!input.trim()) {
      return { valid: false, errors: [{ severity: "error", message: "YAML content is empty" }] };
    }

    const lines = input.split("\n");
    const { value: config, parseError } = parseSimpleYaml(input);

    if (parseError || !config) {
      return {
        valid: false,
        errors: [{ severity: "error", message: parseError ?? "Failed to parse YAML" }],
      };
    }

    const errors = validateSindriConfig(config, lines);
    return { valid: errors.length === 0, errors };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setResult(validate(yaml));
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [yaml, debounceMs, validate]);

  return result;
}
