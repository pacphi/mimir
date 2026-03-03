// ─────────────────────────────────────────────────────────────────────────────
// Simple YAML parser extracted from useYamlValidation for shared use.
// Parses basic YAML structure without a full library dependency.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedSindriConfig {
  version?: unknown;
  name?: unknown;
  deployment?: {
    provider?: unknown;
    image?: unknown;
    image_config?: unknown;
    resources?: unknown;
    volumes?: unknown;
  };
  extensions?: {
    profile?: unknown;
    active?: unknown[];
    additional?: unknown[];
    auto_install?: unknown;
  };
  secrets?: unknown[];
  providers?: unknown;
}

export function parseSimpleYaml(yaml: string): {
  value: ParsedSindriConfig | null;
  parseError: string | null;
} {
  try {
    const lines = yaml.split("\n");
    const result: Record<string, unknown> = {};
    const stack: Array<{ obj: Record<string, unknown>; indent: number; key: string | null }> = [
      { obj: result, indent: -1, key: null },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) continue;

      const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      const trimmed = line.trim();

      const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
      if (kvMatch) {
        const [, key, rawVal] = kvMatch;
        const val = rawVal.trim();

        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }
        const parent = stack[stack.length - 1].obj;

        if (val === "" || val === null) {
          const nested: Record<string, unknown> = {};
          parent[key] = nested;
          stack.push({ obj: nested, indent, key });
        } else if (val === "true" || val === "false") {
          parent[key] = val === "true";
        } else if (!isNaN(Number(val)) && val !== "") {
          parent[key] = Number(val);
        } else {
          parent[key] = val.replace(/^["']|["']$/g, "");
        }
        continue;
      }

      const arrayMatch = trimmed.match(/^-\s*(.*)$/);
      if (arrayMatch) {
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }
        const parent = stack[stack.length - 1].obj;
        const parentKey = stack[stack.length - 1].key;
        if (parentKey) {
          const arr = (parent[parentKey] as unknown[]) ?? [];
          parent[parentKey] = arr;
          const itemVal = arrayMatch[1].trim().replace(/^["']|["']$/g, "");
          if (itemVal) arr.push(itemVal);
        }
      }
    }

    return { value: result as ParsedSindriConfig, parseError: null };
  } catch {
    return { value: null, parseError: "Failed to parse YAML" };
  }
}
