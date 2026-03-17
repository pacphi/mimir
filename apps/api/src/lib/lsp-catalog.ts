/**
 * Language server catalog — maps language IDs to LS commands.
 * Each entry defines how to spawn the language server for a given language.
 */

interface LspServerDef {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** File extensions this server handles */
  extensions: string[];
}

export const LANGUAGE_SERVERS: Record<string, LspServerDef> = {
  rust: {
    command: "rust-analyzer",
    args: [],
    extensions: [".rs"],
  },
  python: {
    command: "pyright-langserver",
    args: ["--stdio"],
    extensions: [".py", ".pyi"],
  },
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  go: {
    command: "gopls",
    args: [],
    extensions: [".go"],
  },
  yaml: {
    command: "yaml-language-server",
    args: ["--stdio"],
    extensions: [".yml", ".yaml"],
  },
  toml: {
    command: "taplo",
    args: ["lsp", "stdio"],
    extensions: [".toml"],
  },
};

/** Infer language ID from file extension */
export function inferLanguageId(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  for (const [langId, def] of Object.entries(LANGUAGE_SERVERS)) {
    if (def.extensions.includes(ext)) return langId;
  }
  return "plaintext";
}
