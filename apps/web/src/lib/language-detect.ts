/**
 * Infer Monaco editor language ID from a file path extension.
 */

const EXTENSION_MAP: Record<string, string> = {
  ".rs": "rust",
  ".py": "python",
  ".pyi": "python",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".go": "go",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".json": "json",
  ".jsonc": "jsonc",
  ".md": "markdown",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".xml": "xml",
  ".svg": "xml",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".sql": "sql",
  ".dockerfile": "dockerfile",
  ".rb": "ruby",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "scala",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cc": "cpp",
  ".cs": "csharp",
  ".swift": "swift",
  ".lua": "lua",
  ".r": "r",
  ".R": "r",
  ".php": "php",
  ".pl": "perl",
  ".pm": "perl",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".hs": "haskell",
  ".tf": "hcl",
  ".hcl": "hcl",
  ".ini": "ini",
  ".conf": "ini",
  ".cfg": "ini",
  ".env": "ini",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".proto": "protobuf",
};

/** Filename-based overrides (no extension) */
const FILENAME_MAP: Record<string, string> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile",
  "Cargo.toml": "toml",
  "docker-compose.yml": "yaml",
  "docker-compose.yaml": "yaml",
  ".gitignore": "ini",
  ".dockerignore": "ini",
  ".editorconfig": "ini",
};

export function inferLanguageId(filePath: string): string {
  const fileName = filePath.split("/").pop() ?? "";

  // Check filename first
  if (FILENAME_MAP[fileName]) return FILENAME_MAP[fileName];

  // Check extension
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return EXTENSION_MAP[ext] ?? "plaintext";
}

/** Get the LSP language ID (used for language server connections) */
export function inferLspLanguageId(filePath: string): string {
  const monacoLang = inferLanguageId(filePath);
  // Map Monaco-specific languages to LSP language IDs
  const LSP_MAP: Record<string, string> = {
    typescriptreact: "typescript",
    javascriptreact: "javascript",
  };
  return LSP_MAP[monacoLang] ?? monacoLang;
}
