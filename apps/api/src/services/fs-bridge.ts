/**
 * Filesystem bridge — reads/writes files on Docker containers
 * for the Shell IDE editor integration.
 *
 * All operations shell out via `docker exec` (not via the PTY layer)
 * to keep editor I/O isolated from the interactive terminal session.
 *
 * Security note: RBAC is enforced at the gateway level — the WebSocket
 * gateway validates team membership and filesystem operation permissions
 * before any fs-bridge function is invoked.
 */

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { posix as path } from "node:path";
import { existsSync } from "node:fs";
import { logger } from "../lib/logger.js";

const execFileAsync = promisify(execFile);

/** Maximum file size for fs:read (2MB) */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Maximum entries returned by listDirectory to prevent DoS from huge directories */
const MAX_LIST_ENTRIES = 1000;

/**
 * Filesystem root jail — all operations are confined to this directory.
 * Configurable via EDITOR_FS_ROOT env var; defaults to the workspace
 * directory inside Sindri containers.
 */
const FS_ROOT = process.env.EDITOR_FS_ROOT ?? "/alt/home/developer/workspace";

/** Resolve the docker binary — same lookup as gateway.ts spawnDockerTerminal */
function resolveDockerBin(): string {
  for (const p of ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "/usr/bin/docker"]) {
    if (existsSync(p)) return p;
  }
  try {
    return execFileSync("/usr/bin/which", ["docker"], { encoding: "utf-8" }).trim();
  } catch {
    return "docker";
  }
}

const dockerBin = resolveDockerBin();

/**
 * Normalize and validate a path, jailing it under FS_ROOT (/alt/home/developer).
 * Rejects any path that would escape the jail after normalization.
 */
function safePath(inputPath: string): string {
  if (inputPath.includes("\0")) {
    logger.warn({ inputPath }, "fs-bridge: rejected path containing null byte");
    throw new Error("Path rejected: contains null byte");
  }

  // Resolve the path relative to FS_ROOT so relative paths stay jailed
  const resolved = inputPath.startsWith("/")
    ? path.normalize(inputPath)
    : path.normalize(path.join(FS_ROOT, inputPath));

  // Ensure the resolved path is within FS_ROOT (exact match or child)
  if (resolved !== FS_ROOT && !resolved.startsWith(FS_ROOT + "/")) {
    logger.warn({ inputPath, resolved, fsRoot: FS_ROOT }, "fs-bridge: path escapes jail");
    throw new Error(`Access denied: path is outside ${FS_ROOT}`);
  }

  return resolved;
}

export interface FsEntryResult {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
  modified?: string;
}

/**
 * List directory contents on a Docker container.
 */
export async function listDirectory(
  containerName: string,
  dirPath: string,
): Promise<FsEntryResult[]> {
  const safe = safePath(dirPath);

  // Use `find` with -printf to get file names with type indicators
  // -maxdepth 1 -mindepth 1: immediate children only
  const { stdout } = await execFileAsync(
    dockerBin,
    [
      "exec",
      containerName,
      "find",
      safe,
      "-maxdepth",
      "1",
      "-mindepth",
      "1",
      "-printf",
      "%y\\t%s\\t%T@\\t%f\\t%p\\n",
    ],
    { maxBuffer: 1 * 1024 * 1024, timeout: 10_000 },
  );

  const entries: FsEntryResult[] = [];
  for (const line of stdout.split("\n").filter(Boolean)) {
    const [typeChar, sizeStr, mtimeStr, name, fullPath] = line.split("\t");
    const type = typeChar === "d" ? "directory" : typeChar === "l" ? "symlink" : "file";
    entries.push({
      name,
      path: fullPath,
      type,
      size: parseInt(sizeStr, 10) || undefined,
      modified: mtimeStr ? new Date(parseFloat(mtimeStr) * 1000).toISOString() : undefined,
    });
  }

  // Sort: directories first, then alphabetical
  entries.sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory") return -1;
    if (a.type !== "directory" && b.type === "directory") return 1;
    return a.name.localeCompare(b.name);
  });

  if (entries.length > MAX_LIST_ENTRIES) {
    logger.warn(
      { dirPath: safe, totalEntries: entries.length, limit: MAX_LIST_ENTRIES },
      "fs-bridge: directory listing truncated",
    );
    return entries.slice(0, MAX_LIST_ENTRIES);
  }

  return entries;
}

/**
 * Read a file from a Docker container. Returns base64-encoded content.
 */
export async function readFile(
  containerName: string,
  filePath: string,
): Promise<{ content: string; encoding: "utf8" | "binary" }> {
  const safe = safePath(filePath);

  // Check file size first
  let sizeOut: string;
  try {
    const result = await execFileAsync(
      dockerBin,
      ["exec", containerName, "stat", "-c", "%s", "--", safe],
      { timeout: 5_000 },
    );
    sizeOut = result.stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`File not found or not accessible: ${safe} (${msg})`, { cause: err });
  }

  const fileSize = parseInt(sizeOut.trim(), 10);
  if (Number.isNaN(fileSize)) {
    throw new Error(`Unable to determine file size: ${safe}`);
  }
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${fileSize} bytes (max ${MAX_FILE_SIZE})`);
  }

  // Read file content
  const { stdout } = await execFileAsync(dockerBin, ["exec", containerName, "cat", "--", safe], {
    maxBuffer: MAX_FILE_SIZE + 1024,
    encoding: "buffer",
    timeout: 15_000,
  });

  const buf = stdout as unknown as Buffer;
  const isText = !buf.includes(0x00); // null byte check
  return {
    content: buf.toString("base64"),
    encoding: isText ? "utf8" : "binary",
  };
}

/**
 * Write a file to a Docker container. Content should be base64-encoded.
 */
export async function writeFile(
  containerName: string,
  filePath: string,
  contentBase64: string,
): Promise<void> {
  const safe = safePath(filePath);
  const decoded = Buffer.from(contentBase64, "base64");

  logger.info({ containerName, filePath: safe, size: decoded.length }, "fs-bridge: writing file");

  // Pipe via docker exec + tee to avoid shell injection
  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      dockerBin,
      ["exec", "-i", containerName, "tee", "--", safe],
      { timeout: 15_000 },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
    child.stdin?.end(decoded);
    // Suppress tee's stdout echo
    child.stdout?.resume();
  });
}
