/**
 * Safe CLI executor for the `sindri` binary.
 *
 * Environment variables:
 *   SINDRI_BIN_PATH       — explicit path to the sindri binary
 *   SINDRI_CLI_TIMEOUT_MS — execution timeout in ms (default: 15000)
 *
 * Fallback chain:
 *   1. SINDRI_BIN_PATH env var (explicit path)
 *   2. "sindri" on system PATH
 *   3. ./node_modules/.bin/sindri (@sindri/cli npm package, Phase 2)
 *   4. Throws CLI_NOT_FOUND
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

export class CliNotFoundError extends Error {
  readonly code = "CLI_NOT_FOUND";
  constructor() {
    super("sindri binary not found — set SINDRI_BIN_PATH or install @sindri/cli");
  }
}

export class CliTimeoutError extends Error {
  readonly code = "CLI_TIMEOUT";
  constructor(timeoutMs: number) {
    super(`sindri CLI timed out after ${timeoutMs}ms`);
  }
}

export class CliExitError extends Error {
  readonly code = "CLI_ERROR";
  readonly stderr: string;
  constructor(message: string, stderr: string) {
    super(message);
    this.stderr = stderr;
  }
}

/**
 * Returns true if the sindri binary is explicitly configured and exists on disk.
 * Returns false when the only option is a bare PATH lookup (not verifiable without exec).
 */
export function isCliConfigured(): boolean {
  const explicit = process.env.SINDRI_BIN_PATH;
  if (explicit) return existsSync(explicit);

  const localNpm = "./node_modules/.bin/sindri";
  if (existsSync(localNpm)) return true;

  return false;
}

/**
 * Resolves the sindri binary path using the fallback chain.
 * Returns the resolved path or throws CliNotFoundError.
 */
export function getSindriBin(): string {
  const explicit = process.env.SINDRI_BIN_PATH;
  if (explicit) return explicit;

  const localNpm = "./node_modules/.bin/sindri";
  if (existsSync(localNpm)) return localNpm;

  // Default to PATH lookup — execFile will throw ENOENT if not found
  return "sindri";
}

/**
 * Runs a sindri subcommand and returns raw stdout/stderr without forcing --json.
 * Use this for commands like `deploy` that stream human-readable output.
 *
 * @param args      CLI arguments (e.g. ["deploy", "--config", "/tmp/foo.yaml"])
 * @param env       Optional environment variables merged into process.env
 * @param timeoutMs Override timeout (defaults to SINDRI_CLI_TIMEOUT_MS or 300 000 ms)
 */
export async function runCliCapture(
  args: string[],
  env?: Record<string, string>,
  timeoutMs?: number,
): Promise<{ stdout: string; stderr: string }> {
  const bin = getSindriBin();
  const effectiveTimeout = timeoutMs ?? parseInt(process.env.SINDRI_CLI_TIMEOUT_MS ?? "300000", 10);

  logger.debug({ bin, args }, "Running sindri CLI (capture)");

  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: effectiveTimeout,
      maxBuffer: 10 * 1024 * 1024,
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });
    return { stdout, stderr };
  } catch (err: unknown) {
    if (err instanceof Error) {
      const nodeErr = err as NodeJS.ErrnoException & { killed?: boolean; stderr?: string };

      if (nodeErr.killed || nodeErr.code === "ETIMEDOUT") {
        throw new CliTimeoutError(effectiveTimeout);
      }

      if (nodeErr.code === "ENOENT") {
        throw new CliNotFoundError();
      }

      throw new CliExitError(err.message, nodeErr.stderr ?? "");
    }
    throw err;
  }
}

/**
 * Runs a sindri subcommand with --json appended and returns the parsed output.
 *
 * @param args  CLI arguments (e.g. ["extension", "list", "--all"])
 * @param env   Optional additional environment variables merged into process.env
 * @returns     Parsed JSON output cast to T
 * @throws      CliNotFoundError | CliTimeoutError | CliExitError | SyntaxError
 */
export async function runCliJson<T>(args: string[], env?: Record<string, string>): Promise<T> {
  const bin = getSindriBin();
  const timeoutMs = parseInt(process.env.SINDRI_CLI_TIMEOUT_MS ?? "15000", 10);

  logger.debug({ bin, args }, "Running sindri CLI");

  try {
    const { stdout } = await execFileAsync(bin, [...args, "--json"], {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });
    return JSON.parse(stdout) as T;
  } catch (err: unknown) {
    if (err instanceof Error) {
      const nodeErr = err as NodeJS.ErrnoException & { killed?: boolean; stderr?: string };

      if (nodeErr.killed || nodeErr.code === "ETIMEDOUT") {
        throw new CliTimeoutError(timeoutMs);
      }

      if (nodeErr.code === "ENOENT") {
        throw new CliNotFoundError();
      }

      throw new CliExitError(err.message, nodeErr.stderr ?? "");
    }
    throw err;
  }
}
