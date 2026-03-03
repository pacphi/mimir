/**
 * WebSocket ticket issuance route.
 *
 *   POST /api/v1/ws/ticket — issue a short-lived ticket for WebSocket auth
 *
 * The client authenticates via cookie or API key header (not query param),
 * receives a 30-second single-use ticket, then passes it as ?ticket=<token>
 * on the WebSocket upgrade request.
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitStrict } from "../middleware/rateLimit.js";
import { issueTicket } from "../websocket/tickets.js";

export const wsTicketRouter = new Hono();

wsTicketRouter.use("*", authMiddleware);

wsTicketRouter.post("/ticket", rateLimitStrict, async (c) => {
  const auth = c.get("auth");

  const ticket = await issueTicket({
    userId: auth.userId,
    role: auth.role,
    apiKeyId: auth.apiKeyId,
    sessionId: auth.sessionId,
    authMethod: auth.authMethod,
  });

  return c.json({ ticket, expires_in: 30 });
});
