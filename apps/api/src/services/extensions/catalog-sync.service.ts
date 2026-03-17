/**
 * GitHub catalog sync — periodically fetches extension metadata from the
 * Sindri GitHub repo and caches in Redis + DB.
 *
 * Fallback chain:
 *   1. GitHub API → Redis cache
 *   2. If GitHub unreachable → Redis cache (within TTL)
 *   3. If Redis cold → static JSON fallback file
 */

import { redis } from "../../lib/redis.js";
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const GITHUB_OWNER = process.env.SINDRI_EXT_GITHUB_OWNER ?? "pacphi";
const GITHUB_REPO = process.env.SINDRI_EXT_GITHUB_REPO ?? "sindri";
const GITHUB_BRANCH = process.env.SINDRI_EXT_GITHUB_BRANCH ?? "main";
const GITHUB_BASE_PATH = process.env.SINDRI_EXT_GITHUB_BASE_PATH ?? "v3/extensions";
const SYNC_INTERVAL_MS = parseInt(process.env.SINDRI_EXT_SYNC_INTERVAL_MS ?? "3600000", 10);
const REDIS_CATALOG_KEY = "sindri:ext:catalog";
const REDIS_CATALOG_TTL = 7200; // 2 hours

/** Shape of a parsed extension.yaml from the Sindri repo. */
export interface CatalogExtension {
  name: string;
  category: string;
  description: string;
  version: string;
  author?: string;
  homepage?: string;
  dependencies?: string[];
  distros?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub fetching
// ─────────────────────────────────────────────────────────────────────────────

async function fetchGitHubCatalog(): Promise<CatalogExtension[]> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "mimir-catalog-sync",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Step 1: List extension directories
  const contentsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_BASE_PATH}?ref=${GITHUB_BRANCH}`;
  const dirResp = await fetch(contentsUrl, { headers });
  if (!dirResp.ok) {
    throw new Error(`GitHub API ${dirResp.status}: ${await dirResp.text().catch(() => "")}`);
  }

  const entries = (await dirResp.json()) as Array<{ name: string; type: string }>;
  const dirs = entries.filter((e) => e.type === "dir");

  // Step 2: Fetch extension.yaml for each directory (in parallel batches of 10)
  const extensions: CatalogExtension[] = [];
  const batchSize = 10;

  for (let i = 0; i < dirs.length; i += batchSize) {
    const batch = dirs.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (dir) => {
        const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_BASE_PATH}/${dir.name}/extension.yaml`;
        const resp = await fetch(rawUrl, { headers: { "User-Agent": "mimir-catalog-sync" } });
        if (!resp.ok) return null;
        const text = await resp.text();
        return parseExtensionYaml(dir.name, text);
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        extensions.push(r.value);
      }
    }
  }

  return extensions;
}

/** Minimal YAML parser for extension.yaml (avoids adding a YAML dep). */
function parseExtensionYaml(dirName: string, yaml: string): CatalogExtension {
  const lines = yaml.split("\n");
  const ext: CatalogExtension = {
    name: dirName,
    category: "tools",
    description: "",
    version: "0.0.0",
  };

  let inDeps = false;
  let inDistros = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle list items for dependencies/distros
    if (trimmed.startsWith("- ") && (inDeps || inDistros)) {
      const val = trimmed
        .slice(2)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (inDeps) {
        ext.dependencies = ext.dependencies ?? [];
        ext.dependencies.push(val);
      } else if (inDistros) {
        ext.distros = ext.distros ?? [];
        ext.distros.push(val);
      }
      continue;
    }

    // Reset list context when hitting a non-list line
    if (!trimmed.startsWith("- ")) {
      inDeps = false;
      inDistros = false;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed
      .slice(colonIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    switch (key) {
      case "name":
        ext.name = value || dirName;
        break;
      case "category":
        ext.category = value;
        break;
      case "description":
        ext.description = value;
        break;
      case "version":
        ext.version = value;
        break;
      case "author":
        ext.author = value;
        break;
      case "homepage":
        ext.homepage = value;
        break;
      case "dependencies":
        if (!value) {
          inDeps = true;
          ext.dependencies = [];
        }
        break;
      case "distros":
        if (!value) {
          inDistros = true;
          ext.distros = [];
        }
        break;
    }
  }

  return ext;
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis cache
// ─────────────────────────────────────────────────────────────────────────────

async function cacheToRedis(extensions: CatalogExtension[]): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.del(REDIS_CATALOG_KEY);
  for (const ext of extensions) {
    pipeline.hset(REDIS_CATALOG_KEY, ext.name, JSON.stringify(ext));
  }
  pipeline.expire(REDIS_CATALOG_KEY, REDIS_CATALOG_TTL);
  await pipeline.exec();
}

async function loadFromRedisCache(): Promise<CatalogExtension[] | null> {
  const all = await redis.hgetall(REDIS_CATALOG_KEY);
  if (!all || Object.keys(all).length === 0) return null;
  return Object.values(all).map((v) => JSON.parse(v) as CatalogExtension);
}

// ─────────────────────────────────────────────────────────────────────────────
// Static fallback
// ─────────────────────────────────────────────────────────────────────────────

async function loadStaticFallback(): Promise<CatalogExtension[]> {
  try {
    const { default: catalog } = await import("../../data/extension-catalog.json", {
      with: { type: "json" },
    });
    return catalog as CatalogExtension[];
  } catch {
    logger.warn("catalog-sync: static fallback file not found");
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB upsert
// ─────────────────────────────────────────────────────────────────────────────

async function upsertToDatabase(extensions: CatalogExtension[]): Promise<void> {
  let upserted = 0;
  for (const ext of extensions) {
    try {
      await db.extension.upsert({
        where: { name: ext.name },
        update: {
          description: ext.description,
          category: ext.category,
          version: ext.version,
          author: ext.author ?? null,
          homepage_url: ext.homepage ?? null,
          dependencies: ext.dependencies ?? [],
        },
        create: {
          name: ext.name,
          display_name: ext.name,
          description: ext.description || `Sindri extension: ${ext.name}`,
          category: ext.category,
          version: ext.version,
          author: ext.author ?? null,
          homepage_url: ext.homepage ?? null,
          dependencies: ext.dependencies ?? [],
          is_official: true,
          scope: "PUBLIC",
        },
      });
      upserted++;
    } catch (err) {
      logger.debug({ err, extension: ext.name }, "catalog-sync: failed to upsert extension");
    }
  }
  logger.info({ upserted, total: extensions.length }, "catalog-sync: DB upsert complete");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Run a single catalog sync cycle. */
export async function syncCatalog(): Promise<CatalogExtension[]> {
  // Try GitHub first
  try {
    const extensions = await fetchGitHubCatalog();
    logger.info({ count: extensions.length }, "catalog-sync: fetched from GitHub");
    await cacheToRedis(extensions);
    await upsertToDatabase(extensions);
    return extensions;
  } catch (err) {
    logger.warn({ err }, "catalog-sync: GitHub fetch failed, trying Redis cache");
  }

  // Fallback to Redis cache
  const cached = await loadFromRedisCache();
  if (cached) {
    logger.info({ count: cached.length }, "catalog-sync: using Redis cache");
    return cached;
  }

  // Fallback to static file
  logger.info("catalog-sync: Redis cache empty, loading static fallback");
  const fallback = await loadStaticFallback();
  if (fallback.length > 0) {
    await cacheToRedis(fallback);
    await upsertToDatabase(fallback);
  }
  return fallback;
}

/** Get a single extension from the catalog cache. */
export async function getCatalogExtension(name: string): Promise<CatalogExtension | null> {
  const raw = await redis.hget(REDIS_CATALOG_KEY, name);
  return raw ? (JSON.parse(raw) as CatalogExtension) : null;
}

/** Get all extensions from the catalog cache. */
export async function getAllCatalogExtensions(): Promise<CatalogExtension[]> {
  const cached = await loadFromRedisCache();
  return cached ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Periodic sync lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let syncTimer: ReturnType<typeof setInterval> | null = null;

export function startCatalogSync(): void {
  logger.info(
    { intervalMs: SYNC_INTERVAL_MS },
    "catalog-sync: starting periodic extension catalog sync",
  );

  // Initial sync (non-blocking)
  syncCatalog().catch((err) => {
    logger.error({ err }, "catalog-sync: initial sync failed");
  });

  syncTimer = setInterval(() => {
    syncCatalog().catch((err) => {
      logger.error({ err }, "catalog-sync: periodic sync failed");
    });
  }, SYNC_INTERVAL_MS);
}

export function stopCatalogSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    logger.info("catalog-sync: stopped");
  }
}
