/**
 * Terminal session routes.
 *
 * POST   /api/v1/instances/:id/terminal              — create a terminal session
 * DELETE /api/v1/instances/:id/terminal/:sessionId    — close a terminal session
 */

import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.js";
import { rateLimitStrict } from "../../middleware/rateLimit.js";
import { db } from "../../lib/db.js";
import { createTerminalSession, closeTerminalSession } from "../../services/terminal-sessions.js";
import { logger } from "../../lib/logger.js";

export const terminalRouter = new Hono();

terminalRouter.use("*", authMiddleware);

// ── Create terminal session ──────────────────────────────────────────────────
terminalRouter.post("/:id/terminal", rateLimitStrict, async (c) => {
  const instanceId = c.req.param("id");
  const auth = c.get("auth");

  // Verify instance exists
  const instance = await db.instance.findUnique({
    where: { id: instanceId },
    select: { id: true, name: true },
  });

  if (!instance) {
    return c.json({ error: "Not Found", message: "Instance not found" }, 404);
  }

  const sessionId = crypto.randomUUID();

  try {
    await createTerminalSession(sessionId, instanceId, auth.userId);
  } catch (err) {
    logger.error({ err, instanceId, sessionId }, "Failed to create terminal session");
    return c.json({ error: "Internal Error", message: "Failed to create terminal session" }, 500);
  }

  const protocol = c.req.header("x-forwarded-proto") === "https" ? "wss:" : "ws:";
  const host = c.req.header("host") ?? "localhost:3001";
  const websocketUrl = `${protocol}//${host}/ws/terminal/${sessionId}`;

  logger.info({ sessionId, instanceId, userId: auth.userId }, "Terminal session created");

  return c.json({ sessionId, websocketUrl }, 201);
});

// ── Close terminal session ───────────────────────────────────────────────────
terminalRouter.delete("/:id/terminal/:sessionId", rateLimitStrict, async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    await closeTerminalSession(sessionId, "user_closed");
  } catch (err) {
    logger.warn({ err, sessionId }, "Failed to close terminal session");
    // Don't error out — session may already be closed
  }

  return c.json({ ok: true });
});
