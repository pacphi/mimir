/**
 * WebSocket ticket system — short-lived, single-use tokens for secure
 * WebSocket upgrade without exposing API keys in query parameters.
 *
 * Flow:
 *   1. Client calls POST /api/v1/ws/ticket (authenticated via cookie/API key header)
 *   2. Server issues a random ticket, stores in Redis with 30s TTL
 *   3. Client connects WebSocket with ?ticket=<token>
 *   4. Server validates + consumes ticket (single-use) and maps to userId/role
 *
 * This eliminates the security risk of API keys appearing in access logs
 * via query parameters.
 */

import { randomBytes } from "crypto";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

const TICKET_PREFIX = "ws:ticket:";
const TICKET_TTL_SECONDS = 30;

export interface TicketPayload {
  userId: string;
  role: string;
  apiKeyId?: string;
  sessionId?: string;
  authMethod: "api_key" | "session";
}

/**
 * Issue a new WebSocket ticket. Stores payload in Redis with 30s TTL.
 * Returns the opaque ticket token.
 */
export async function issueTicket(payload: TicketPayload): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const key = `${TICKET_PREFIX}${token}`;

  await redis.set(key, JSON.stringify(payload), "EX", TICKET_TTL_SECONDS);
  logger.debug({ userId: payload.userId }, "WebSocket ticket issued");

  return token;
}

/**
 * Consume a WebSocket ticket. Returns the payload if valid, null otherwise.
 * Tickets are single-use — deleted immediately after retrieval.
 */
export async function consumeTicket(token: string): Promise<TicketPayload | null> {
  const key = `${TICKET_PREFIX}${token}`;

  // Atomic get-and-delete to ensure single use
  const pipeline = redis.pipeline();
  pipeline.get(key);
  pipeline.del(key);
  const results = await pipeline.exec();

  if (!results) return null;
  const [getResult] = results;
  const raw = getResult?.[1] as string | null;

  if (!raw) return null;

  try {
    return JSON.parse(raw) as TicketPayload;
  } catch {
    logger.warn("Invalid WebSocket ticket payload — corrupted data");
    return null;
  }
}
