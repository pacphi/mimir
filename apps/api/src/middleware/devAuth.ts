/**
 * Development-only auth bypass middleware.
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
