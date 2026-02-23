/**
 * Profiles catalog route.
 *
 * GET /api/v1/profiles — list all extension profiles (live from sindri CLI)
 *
 * Delegates to the registry route's profile logic but keeps the original
 * /api/v1/profiles path for backwards compatibility with existing clients.
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitDefault } from "../middleware/rateLimit.js";
import { runCliJson, CliNotFoundError, CliTimeoutError } from "../lib/cli.js";
import { logger } from "../lib/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// CLI output shapes
// ─────────────────────────────────────────────────────────────────────────────

interface CliProfileSummary {
  name: string;
  description?: string;
  extensions: number;
}

interface CliProfileDetail {
  name: string;
  description?: string;
  extensions: string[];
  total_with_dependencies?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static fallback (used when CLI is unavailable)
// ─────────────────────────────────────────────────────────────────────────────

const STATIC_PROFILES = [
  {
    name: "minimal",
    description: "Minimal development setup",
    extensions: ["nodejs", "python"],
    extension_count: 2,
  },
  {
    name: "fullstack",
    description: "Full-stack web development",
    extensions: ["nodejs", "python", "docker", "nodejs-devtools"],
    extension_count: 4,
  },
  {
    name: "anthropic-dev",
    description: "AI development with Anthropic toolset bias (v3 default - 10x performance)",
    extensions: [
      "claude-cli",
      "agent-manager",
      "claude-flow-v3",
      "agentic-qe",
      "kilo",
      "ralph",
      "golang",
      "ollama",
      "ai-toolkit",
      "claudish",
      "claude-marketplace",
      "compahook",
      "infra-tools",
      "jvm",
      "mdflow",
      "openskills",
      "pal-mcp-server",
      "nodejs-devtools",
      "playwright",
      "agent-browser",
      "rust",
      "ruvnet-research",
      "linear-mcp",
      "supabase-cli",
      "tmux-workspace",
      "cloud-tools",
      "notebooklm-mcp-cli",
      "ruvector-cli",
      "rvf-cli",
    ],
    extension_count: 29,
  },
  {
    name: "systems",
    description: "Systems programming",
    extensions: ["rust", "golang", "haskell", "docker", "infra-tools"],
    extension_count: 5,
  },
  {
    name: "enterprise",
    description: "Enterprise development (all languages)",
    extensions: [
      "claude-cli",
      "kilo",
      "nodejs",
      "python",
      "golang",
      "rust",
      "ruby",
      "jvm",
      "dotnet",
      "docker",
      "jira-mcp",
      "cloud-tools",
    ],
    extension_count: 12,
  },
  {
    name: "devops",
    description: "DevOps and infrastructure",
    extensions: ["docker", "infra-tools", "monitoring", "cloud-tools"],
    extension_count: 4,
  },
  {
    name: "mobile",
    description: "Mobile development",
    extensions: ["nodejs", "swift", "linear-mcp", "supabase-cli"],
    extension_count: 4,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const profiles = new Hono();

profiles.use("*", authMiddleware);

// ─── GET /api/v1/profiles ────────────────────────────────────────────────────

profiles.get("/", rateLimitDefault, async (c) => {
  try {
    const summaries = await runCliJson<CliProfileSummary[]>(["profile", "list"]);

    // Fan-out profile info calls in parallel
    const details = await Promise.allSettled(
      summaries.map((s) => runCliJson<CliProfileDetail>(["profile", "info", s.name])),
    );

    const liveProfiles = summaries.map((summary, i) => {
      const detail = details[i];
      const extensions = detail.status === "fulfilled" ? detail.value.extensions : [];
      return {
        name: summary.name,
        description: summary.description ?? "",
        extensions,
        extension_count: summary.extensions,
      };
    });

    return c.json({ profiles: liveProfiles });
  } catch (err) {
    if (err instanceof CliNotFoundError || err instanceof CliTimeoutError) {
      logger.warn({ err }, "Profiles CLI unavailable — returning static fallback");
      return c.json({ profiles: STATIC_PROFILES, fallback: true });
    }
    logger.error({ err }, "Failed to fetch profiles from CLI");
    return c.json({ profiles: STATIC_PROFILES, fallback: true });
  }
});

export { profiles as profilesRouter };
