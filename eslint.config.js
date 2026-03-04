/**
 * Root ESLint config for lint-staged. Uses syntax-only rules (no type-aware
 * linting) to avoid tsconfigRootDir conflicts in the monorepo.
 */
import js from "@eslint/js";
import tsParser from "typescript-eslint";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser.parser,
      parserOptions: {
        // Explicit root dir prevents "multiple candidate" errors
        tsconfigRootDir: __dirname,
        projectService: false,
        project: false,
        programs: undefined,
      },
    },
    plugins: {
      "@typescript-eslint": tsParser.plugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
      "no-unused-vars": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "**/node_modules/**",
      "**/*.config.ts",
      "**/*.config.js",
      "**/prisma/**",
    ],
  },
];
