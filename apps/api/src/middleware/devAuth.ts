/**
 * Development-only auth bypass middleware.
 *
 * Safety gates (ALL must be true):
 *   1. NODE_ENV === "development"
 *   2. AUTH_BYPASS === "true"
 *
 * An additional hard-fail in env-validation.ts blocks AUTH_BYPASS in production.
 */

import type { Context, Next } from "hono";
import type { AuthContext } from "./auth.js";
import { logger } from "../lib/logger.js";

const DEV_ADMIN_USER_ID = "user_admin_01";

export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.AUTH_BYPASS === "true";
}

export async function devAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
  if (!isDevAuthBypassEnabled()) {
    await next();
    return;
  }

  if (!c.get("auth")) {
    const authContext: AuthContext = {
      userId: DEV_ADMIN_USER_ID,
      role: "ADMIN",
      authMethod: "session",
    };
    c.set("auth", authContext);
    logger.debug("Dev auth bypass — authenticated as seed admin");
  }

  await next();
}
