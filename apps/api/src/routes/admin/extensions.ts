/**
 * Admin extension management routes.
 *
 * GET    /api/v1/admin/extensions/categories       — list all category mappings
 * POST   /api/v1/admin/extensions/categories       — create a mapping
 * PUT    /api/v1/admin/extensions/categories/:id   — update a mapping
 * DELETE /api/v1/admin/extensions/categories/:id   — delete a mapping
 * POST   /api/v1/admin/extensions/sync             — trigger manual catalog sync
 */

import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { rateLimitDefault, rateLimitStrict } from "../../middleware/rateLimit.js";
import { logger } from "../../lib/logger.js";
import { db } from "../../lib/db.js";
import { syncCatalog } from "../../services/extensions/catalog-sync.service.js";

const CreateCategoryMappingSchema = z.object({
  sindri_category: z.string().min(1).max(64),
  display_label: z.string().min(1).max(64),
  icon: z.string().max(64).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

const UpdateCategoryMappingSchema = z.object({
  display_label: z.string().min(1).max(64).optional(),
  icon: z.string().max(64).nullable().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

const adminExtensions = new Hono();

adminExtensions.use("*", authMiddleware);
adminExtensions.use("*", requireRole("ADMIN"));

// ─── GET /api/v1/admin/extensions/categories ─────────────────────────────────

adminExtensions.get("/categories", rateLimitDefault, async (c) => {
  try {
    const mappings = await db.extensionCategoryMapping.findMany({
      orderBy: { sort_order: "asc" },
    });
    return c.json({ categories: mappings });
  } catch (err) {
    logger.error({ err }, "Failed to list category mappings");
    return c.json({ error: "Internal Server Error", message: "Failed to list categories" }, 500);
  }
});

// ─── POST /api/v1/admin/extensions/categories ────────────────────────────────

adminExtensions.post("/categories", rateLimitStrict, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateCategoryMappingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Bad Request", issues: parsed.error.issues }, 400);
  }

  try {
    const mapping = await db.extensionCategoryMapping.create({
      data: { ...parsed.data, updated_at: new Date() },
    });
    return c.json(mapping, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create mapping";
    if (message.includes("Unique constraint")) {
      return c.json(
        { error: "Conflict", message: `Category '${parsed.data.sindri_category}' already mapped` },
        409,
      );
    }
    logger.error({ err }, "Failed to create category mapping");
    return c.json({ error: "Internal Server Error", message }, 500);
  }
});

// ─── PUT /api/v1/admin/extensions/categories/:id ─────────────────────────────

adminExtensions.put("/categories/:id", rateLimitStrict, async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateCategoryMappingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Bad Request", issues: parsed.error.issues }, 400);
  }

  try {
    const mapping = await db.extensionCategoryMapping.update({
      where: { id },
      data: parsed.data,
    });
    return c.json(mapping);
  } catch (err) {
    logger.error({ err, id }, "Failed to update category mapping");
    return c.json({ error: "Not Found", message: "Category mapping not found" }, 404);
  }
});

// ─── DELETE /api/v1/admin/extensions/categories/:id ──────────────────────────

adminExtensions.delete("/categories/:id", rateLimitStrict, async (c) => {
  const id = c.req.param("id")!;
  try {
    await db.extensionCategoryMapping.delete({ where: { id } });
    return c.json({ deleted: true });
  } catch (err) {
    logger.error({ err, id }, "Failed to delete category mapping");
    return c.json({ error: "Not Found", message: "Category mapping not found" }, 404);
  }
});

// ─── POST /api/v1/admin/extensions/sync ──────────────────────────────────────

adminExtensions.post("/sync", rateLimitStrict, async (c) => {
  try {
    const extensions = await syncCatalog();
    return c.json({ synced: true, count: extensions.length });
  } catch (err) {
    logger.error({ err }, "Failed to trigger catalog sync");
    return c.json({ error: "Internal Server Error", message: "Catalog sync failed" }, 500);
  }
});

export { adminExtensions as adminExtensionsRouter };
