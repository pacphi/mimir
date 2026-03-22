/**
 * Catalog refresh worker.
 *
 * On startup:
 *  1. Populate base (non-regional) cache for all enabled providers.
 *  2. Pre-warm per-region caches for providers with regional pricing
 *     (aws, gcp, azure, fly). This runs sequentially per region to avoid
 *     overwhelming provider APIs but does not block the server.
 *
 * Then runs every 4 hours to keep caches fresh.
 */

import { logger } from "../lib/logger.js";
import { refreshAll, refreshProviderRegions } from "../services/catalog/catalog.service.js";
import { getCatalogConfig } from "../services/catalog/config.js";
import { getProviderRegionIds } from "../routes/providers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Worker state
// ─────────────────────────────────────────────────────────────────────────────

const WORKER_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
let workerTimer: NodeJS.Timeout | null = null;
let isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Worker lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export function startCatalogWorker(): void {
  if (workerTimer !== null) {
    logger.warn("Catalog worker already started");
    return;
  }

  logger.info({ intervalMs: WORKER_INTERVAL_MS }, "Catalog worker started");

  // Run once immediately on startup (async — non-blocking)
  void runCatalogCycle();

  workerTimer = setInterval(() => void runCatalogCycle(), WORKER_INTERVAL_MS);
}

export function stopCatalogWorker(): void {
  if (workerTimer !== null) {
    clearInterval(workerTimer);
    workerTimer = null;
    logger.info("Catalog worker stopped");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main cycle
// ─────────────────────────────────────────────────────────────────────────────

async function runCatalogCycle(): Promise<void> {
  if (isRunning) {
    logger.debug("Skipping catalog cycle — previous run still in progress");
    return;
  }

  isRunning = true;
  const start = Date.now();

  try {
    logger.info("Catalog worker cycle starting");

    // Phase 1: Refresh base (non-regional) catalogs for all providers
    const results = await refreshAll();

    logger.info(
      {
        durationMs: Date.now() - start,
        refreshed: results.size,
        providers: [...results.keys()],
      },
      "Catalog worker: base catalogs refreshed",
    );

    // Phase 2: Pre-warm per-region caches for regional providers
    const config = getCatalogConfig();
    const regionalProviders = Object.entries(config.providers).filter(
      ([, cfg]) => cfg.enabled && cfg.supports_regional_pricing,
    );

    for (const [providerId] of regionalProviders) {
      const regionIds = getProviderRegionIds(providerId);
      if (regionIds.length === 0) continue;

      logger.info(
        { provider: providerId, regions: regionIds.length },
        "Catalog worker: pre-warming regional caches",
      );

      const cached = await refreshProviderRegions(providerId, regionIds);

      logger.info(
        { provider: providerId, cached, total: regionIds.length },
        "Catalog worker: regional pre-warm complete",
      );
    }

    const durationMs = Date.now() - start;
    logger.info({ durationMs }, "Catalog worker cycle complete");
  } catch (err) {
    logger.error({ err }, "Catalog worker cycle failed");
  } finally {
    isRunning = false;
  }
}
