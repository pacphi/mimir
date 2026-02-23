/**
 * Compatibility version endpoint.
 *
 * GET /api/v1/version — returns console API version, sindri CLI version,
 *                       and the minimum instance version required.
 *
 * Phase 3: used by the UI to compute instance compatibility badges.
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitDefault } from "../middleware/rateLimit.js";
import { runCliJson } from "../lib/cli.js";
import { logger } from "../lib/logger.js";

interface CliVersion {
  version: string;
  commit?: string;
  build_date?: string;
  target?: string;
}

const version = new Hono();

version.use("*", authMiddleware);

version.get("/", rateLimitDefault, async (c) => {
  const apiVersion = process.env.npm_package_version ?? "0.1.0";

  let cliVersion: CliVersion | null = null;
  try {
    cliVersion = await runCliJson<CliVersion>(["version"]);
  } catch (err) {
    logger.warn({ err }, "Could not fetch sindri CLI version");
  }

  // The minimum instance version is the same major.minor as the console CLI.
  // Patch-level mismatches are tolerated.
  let minInstanceVersion: string | null = null;
  if (cliVersion?.version) {
    const parts = cliVersion.version.split(".");
    minInstanceVersion = `${parts[0]}.${parts[1]}.0`;
  }

  return c.json({
    console_api: apiVersion,
    sindri_cli: cliVersion?.version ?? null,
    cli_target: cliVersion?.target ?? null,
    cli_commit: cliVersion?.commit ?? null,
    cli_build_date: cliVersion?.build_date ?? null,
    min_instance_version: minInstanceVersion,
    cli_available: cliVersion !== null,
  });
});

export { version as versionRouter };
