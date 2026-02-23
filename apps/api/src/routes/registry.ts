/**
 * Live registry routes — backed by the `sindri` CLI binary.
 *
 * GET /api/v1/registry/extensions            → sindri extension list --all [--category X] --json
 * GET /api/v1/registry/extensions/categories → derived from extension list
 * GET /api/v1/registry/profiles              → sindri profile list --json + profile info per name
 * GET /api/v1/registry/version               → sindri version --json
 *
 * When the binary is unavailable every endpoint returns:
 *   { error: "CLI_UNAVAILABLE", message: "...", fallback: true }
 * The frontend handles fallback: true by hiding the section gracefully.
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitDefault } from "../middleware/rateLimit.js";
import { runCliJson, CliNotFoundError, CliTimeoutError } from "../lib/cli.js";
import { logger } from "../lib/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// CLI output shapes
// ─────────────────────────────────────────────────────────────────────────────

interface CliExtension {
  name: string;
  category: string;
  version: string;
  software?: string;
  status?: string;
  description?: string;
}

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

interface CliVersion {
  version: string;
  commit?: string;
  build_date?: string;
  target?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error helper
// ─────────────────────────────────────────────────────────────────────────────

function cliUnavailableResponse(err: unknown): { error: string; message: string; fallback: true } {
  const message =
    err instanceof CliNotFoundError
      ? "sindri binary not found — set SINDRI_BIN_PATH or install @sindri/cli"
      : err instanceof CliTimeoutError
        ? "sindri CLI timed out"
        : err instanceof Error
          ? err.message
          : "sindri CLI error";

  return { error: "CLI_UNAVAILABLE", message, fallback: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const registry = new Hono();

registry.use("*", authMiddleware);

// ─── GET /api/v1/registry/extensions ─────────────────────────────────────────

registry.get("/extensions", rateLimitDefault, async (c) => {
  const category = c.req.query("category");
  const search = c.req.query("search");

  const args = ["extension", "list", "--all"];
  if (category) args.push("--category", category);

  try {
    const extensions = await runCliJson<CliExtension[]>(args);

    // Client-side search filter (CLI doesn't support --search)
    const filtered = search
      ? extensions.filter(
          (e) =>
            e.name.toLowerCase().includes(search.toLowerCase()) ||
            e.description?.toLowerCase().includes(search.toLowerCase()),
        )
      : extensions;

    return c.json({ extensions: filtered, total: filtered.length });
  } catch (err) {
    logger.warn({ err }, "Registry extensions CLI call failed");
    return c.json(cliUnavailableResponse(err), 503);
  }
});

// ─── GET /api/v1/registry/extensions/categories ──────────────────────────────

registry.get("/extensions/categories", rateLimitDefault, async (c) => {
  try {
    const extensions = await runCliJson<CliExtension[]>(["extension", "list", "--all"]);

    // Derive categories with counts from the full list
    const counts = new Map<string, number>();
    for (const ext of extensions) {
      counts.set(ext.category, (counts.get(ext.category) ?? 0) + 1);
    }

    const categories = Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category));

    return c.json({ categories });
  } catch (err) {
    logger.warn({ err }, "Registry categories CLI call failed");
    return c.json(cliUnavailableResponse(err), 503);
  }
});

// ─── GET /api/v1/registry/profiles ───────────────────────────────────────────

registry.get("/profiles", rateLimitDefault, async (c) => {
  try {
    const summaries = await runCliJson<CliProfileSummary[]>(["profile", "list"]);

    // Fan-out profile info calls in parallel to get extension arrays
    const details = await Promise.allSettled(
      summaries.map((s) => runCliJson<CliProfileDetail>(["profile", "info", s.name])),
    );

    const profiles = summaries.map((summary, i) => {
      const detail = details[i];
      const extensions = detail.status === "fulfilled" ? detail.value.extensions : [];
      const totalWithDeps =
        detail.status === "fulfilled"
          ? (detail.value.total_with_dependencies ?? extensions.length)
          : summary.extensions;

      return {
        name: summary.name,
        description: summary.description ?? "",
        extensions,
        extension_count: summary.extensions,
        total_with_dependencies: totalWithDeps,
      };
    });

    return c.json({ profiles });
  } catch (err) {
    logger.warn({ err }, "Registry profiles CLI call failed");
    return c.json(cliUnavailableResponse(err), 503);
  }
});

// ─── GET /api/v1/registry/version ────────────────────────────────────────────

registry.get("/version", rateLimitDefault, async (c) => {
  try {
    const version = await runCliJson<CliVersion>(["version"]);
    return c.json(version);
  } catch (err) {
    logger.warn({ err }, "Registry version CLI call failed");
    return c.json(cliUnavailableResponse(err), 503);
  }
});

export { registry as registryRouter };
