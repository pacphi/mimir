/**
 * Catalog refresh worker.
 *
 * Runs on a configurable interval to refresh compute catalogs for all
 * enabled providers. Follows the same setInterval pattern as cost.worker.ts.
 *
 * On startup: immediately populate cache for all enabled providers.
 * Then runs every 4 hours (shortest common interval across providers).
 */

import { logger } from "../lib/logger.js";
import { refreshAll } from "../services/catalog/catalog.service.js";

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

    const results = await refreshAll();

    const durationMs = Date.now() - start;
    logger.info(
      {
        durationMs,
        refreshed: results.size,
        providers: [...results.keys()],
      },
      "Catalog worker cycle complete",
    );
  } catch (err) {
    logger.error({ err }, "Catalog worker cycle failed");
  } finally {
    isRunning = false;
  }
}
