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

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

/**
 * Explicit allowlist of environment variables passed to CLI subprocesses.
 * Server-internal secrets (DATABASE_URL, JWT_SECRET, etc.) are excluded.
 */
const SUBPROCESS_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "TERM",
  "TMPDIR",
  "KUBECONFIG",
  "DOCKER_HOST",
  "DOCKER_CONFIG",
  "SSH_AUTH_SOCK",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "SINDRI_BIN_PATH",
  "SINDRI_CLI_TIMEOUT_MS",
  "NODE_ENV",
  // Provider credentials — CLIs read these from env for authentication.
  // Without these the CLI auth pre-flight checks fail.
  "FLY_API_TOKEN",
  "RUNPOD_API_KEY",
  "NORTHFLANK_API_TOKEN",
  "E2B_API_KEY",
  // DevPod cloud provider credentials
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_DEFAULT_REGION",
  "AWS_SESSION_TOKEN",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "DIGITALOCEAN_TOKEN",
] as const;

/**
 * B5: Build a subprocess environment from an explicit allowlist + user secrets.
 * Server-internal secrets (DATABASE_URL, JWT_SECRET, SESSION_SECRET, etc.)
 * never reach the subprocess.
 */
export function buildSubprocessEnv(userSecrets?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of SUBPROCESS_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Merge user-provided secrets (these override allowlisted vars if colliding,
  // which is fine — user secrets take precedence for deployment commands)
  if (userSecrets) {
    Object.assign(env, userSecrets);
  }

  return env;
}

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
 * Returns true if the sindri binary can be found via any of the fallback paths.
 * Checks SINDRI_BIN_PATH, local npm bin, and system PATH (via `which`).
 */
export function isCliConfigured(): boolean {
  const explicit = process.env.SINDRI_BIN_PATH;
  if (explicit) return existsSync(explicit);

  const localNpm = "./node_modules/.bin/sindri";
  if (existsSync(localNpm)) return true;

  // Check if sindri is on the system PATH
  try {
    execFileSync("which", ["sindri"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
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
 * @param cwd       Working directory for the subprocess (isolates Docker Compose projects)
 */
export async function runCliCapture(
  args: string[],
  env?: Record<string, string>,
  timeoutMs?: number,
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  const bin = getSindriBin();
  const effectiveTimeout = timeoutMs ?? parseInt(process.env.SINDRI_CLI_TIMEOUT_MS ?? "300000", 10);

  logger.debug({ bin, args, cwd }, "Running sindri CLI (capture)");

  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: effectiveTimeout,
      maxBuffer: 10 * 1024 * 1024,
      env: buildSubprocessEnv(env),
      cwd,
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
 * Return (and create if needed) a per-instance working directory.
 *
 * Each Sindri instance gets its own directory so the CLI-generated
 * `docker-compose.yml` lives in an isolated folder. Docker Compose derives
 * its project name from the directory, preventing one deploy from orphaning
 * containers belonging to a different instance.
 *
 * Layout: `<cwd>/instances/<instanceName>/`
 */
export function ensureInstanceDir(instanceName: string): string {
  const dir = join(process.cwd(), "instances", instanceName);
  mkdirSync(dir, { recursive: true });
  return dir;
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
      env: buildSubprocessEnv(env),
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
