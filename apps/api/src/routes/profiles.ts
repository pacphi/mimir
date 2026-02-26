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
      logger.warn({ err }, "Profiles CLI unavailable");
      return c.json(
        { error: "CLI_UNAVAILABLE", message: "Sindri CLI is not reachable", profiles: [] },
        503,
      );
    }
    logger.error({ err }, "Failed to fetch profiles from CLI");
    return c.json({ error: "CLI_ERROR", message: "Failed to fetch profiles", profiles: [] }, 502);
  }
});

export { profiles as profilesRouter };
