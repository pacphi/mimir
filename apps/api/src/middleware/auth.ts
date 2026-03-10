/**
 * Dual-mode HTTP authentication middleware for Hono.
 *
 * Tries authentication methods in order:
 *   1. API key — Authorization: Bearer or X-Api-Key header
 *   2. Session cookie — validated via Better Auth
 */

import type { Context, Next } from "hono";
import { createHash } from "crypto";
import { db } from "../lib/db.js";
import { auth } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

export interface AuthContext {
  userId: string;
  apiKeyId?: string;
  sessionId?: string;
  role: "ADMIN" | "OPERATOR" | "DEVELOPER" | "VIEWER";
  authMethod: "api_key" | "session";
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function extractRawKey(c: Context): string | null {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim() || null;
  }
  const xApiKey = c.req.header("X-Api-Key") ?? c.req.header("X-API-Key");
  if (xApiKey && xApiKey.length > 0) {
    return xApiKey.trim();
  }
  return null;
}

type ApiKeyResult = { ok: true; auth: AuthContext } | { ok: false; error?: string };

async function tryApiKeyAuth(c: Context): Promise<ApiKeyResult> {
  const rawKey = extractRawKey(c);
  if (!rawKey) return { ok: false };

  // System agent API key — used by draupnir instances to register and send data
  const consoleApiKey = process.env.SINDRI_CONSOLE_API_KEY;
  if (consoleApiKey && rawKey === consoleApiKey) {
    return {
      ok: true,
      auth: {
        userId: "system-agent",
        role: "OPERATOR",
        authMethod: "api_key" as const,
      },
    };
  }

  const keyHash = hashKey(rawKey);

  let record: {
    id: string;
    user_id: string;
    expires_at: Date | null;
    user: { role: "ADMIN" | "OPERATOR" | "DEVELOPER" | "VIEWER" };
  } | null;

  try {
    record = await db.apiKey.findUnique({
      where: { key_hash: keyHash },
      include: { user: { select: { role: true } } },
    });
  } catch (err) {
    logger.error({ err }, "Database error during API key lookup");
    return { ok: false };
  }

  if (!record) return { ok: false, error: "Invalid API key" };

  if (record.expires_at !== null && record.expires_at < new Date()) {
    return { ok: false, error: "API key has expired" };
  }

  db.apiKey
    .update({ where: { id: record.id }, data: { last_used_at: new Date() } })
    .catch((err: unknown) =>
      logger.warn({ err, apiKeyId: record!.id }, "Failed to update last_used_at"),
    );

  return {
    ok: true,
    auth: {
      userId: record.user_id,
      apiKeyId: record.id,
      role: record.user.role,
      authMethod: "api_key" as const,
    },
  };
}

async function trySessionAuth(c: Context): Promise<AuthContext | null> {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.session || !session?.user) return null;

    return {
      userId: session.user.id,
      sessionId: session.session.id,
      role: (session.user as unknown as { role: string }).role as AuthContext["role"],
      authMethod: "session",
    };
  } catch {
    return null;
  }
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  // If auth context is already set (e.g. by dev bypass middleware), skip
  if (c.get("auth")) {
    await next();
    return;
  }

  const apiKeyResult = await tryApiKeyAuth(c);
  if (apiKeyResult.ok) {
    c.set("auth", apiKeyResult.auth);
    await next();
    return;
  }

  if (apiKeyResult.error) {
    return c.json({ error: "Unauthorized", message: apiKeyResult.error }, 401);
  }

  const sessionAuth = await trySessionAuth(c);
  if (sessionAuth) {
    c.set("auth", sessionAuth);
    await next();
    return;
  }

  return c.json(
    {
      error: "Unauthorized",
      message:
        "Authentication required. Supply an API key via Authorization: Bearer <key> or X-Api-Key header, or sign in via the web interface.",
    },
    401,
  );
}

const ROLE_RANK: Record<string, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  OPERATOR: 2,
  ADMIN: 3,
};

export function requireRole(minimumRole: "ADMIN" | "OPERATOR" | "DEVELOPER" | "VIEWER") {
  return async function roleGuard(c: Context, next: Next): Promise<Response | void> {
    const auth = c.get("auth");
    if (!auth || ROLE_RANK[auth.role] < ROLE_RANK[minimumRole]) {
      return c.json(
        { error: "Forbidden", message: `This action requires the ${minimumRole} role or higher` },
        403,
      );
    }
    await next();
  };
}
