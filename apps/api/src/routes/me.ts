/**
 * Self-service routes for the authenticated user.
 *
 *   GET    /api/v1/me              — current user profile
 *   GET    /api/v1/me/api-keys     — list own API keys
 *   POST   /api/v1/me/api-keys     — create API key (returns raw key once)
 *   DELETE /api/v1/me/api-keys/:id — revoke own API key
 */

import { Hono } from "hono";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { db } from "../lib/db.js";
import { authMiddleware } from "../middleware/auth.js";

const me = new Hono();

me.use("*", authMiddleware);

me.get("/", async (c) => {
  const auth = c.get("auth");
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      is_active: true,
      email_verified: true,
      image: true,
      last_login_at: true,
      created_at: true,
      team_memberships: {
        select: {
          role: true,
          team: { select: { id: true, name: true } },
        },
      },
      accounts: {
        select: {
          id: true,
          provider_id: true,
          created_at: true,
        },
      },
    },
  });

  if (!user) {
    return c.json({ error: "Not Found", message: "User not found" }, 404);
  }

  return c.json(user);
});

me.get("/api-keys", async (c) => {
  const auth = c.get("auth");
  const keys = await db.apiKey.findMany({
    where: { user_id: auth.userId },
    select: {
      id: true,
      name: true,
      created_at: true,
      expires_at: true,
    },
    orderBy: { created_at: "desc" },
  });

  return c.json({ data: keys, total: keys.length });
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expires_in_days: z.number().int().positive().optional(),
});

me.post("/api-keys", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json();
  const parsed = createApiKeySchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Bad Request", message: "Invalid request body", details: parsed.error.issues },
      400,
    );
  }

  const { name, expires_in_days } = parsed.data;
  const rawKey = `sk-${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const expiresAt = expires_in_days ? new Date(Date.now() + expires_in_days * 86400 * 1000) : null;

  const apiKey = await db.apiKey.create({
    data: {
      user_id: auth.userId,
      key_hash: keyHash,
      name,
      expires_at: expiresAt,
    },
    select: {
      id: true,
      name: true,
      created_at: true,
      expires_at: true,
    },
  });

  return c.json({ ...apiKey, key: rawKey }, 201);
});

me.delete("/api-keys/:id", async (c) => {
  const auth = c.get("auth");
  const keyId = c.req.param("id");

  const existing = await db.apiKey.findFirst({
    where: { id: keyId, user_id: auth.userId },
  });

  if (!existing) {
    return c.json({ error: "Not Found", message: "API key not found" }, 404);
  }

  await db.apiKey.delete({ where: { id: keyId } });

  return c.json({ message: "API key revoked" });
});

export const meRouter = me;
