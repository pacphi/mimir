/**
 * WebSocket connection authentication — dual-mode: API key + session cookie.
 */

import { createHash } from "crypto";
import type { IncomingMessage } from "http";
import { db } from "../lib/db.js";
import { auth } from "../lib/auth.js";
import { consumeTicket } from "./tickets.js";

export interface AuthenticatedPrincipal {
  userId: string;
  role: "ADMIN" | "OPERATOR" | "DEVELOPER" | "VIEWER";
  instanceId?: string;
  apiKeyId?: string;
  sessionId?: string;
  authMethod: "api_key" | "session";
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function extractRawKey(req: IncomingMessage): string | null {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.length > 0) {
    return headerKey;
  }
  // SECURITY NOTE: API keys in query params are logged in access logs by proxies,
  // load balancers, and CDNs. This is a known risk accepted for WebSocket upgrade
  // compatibility. Future improvement: implement a short-lived WebSocket ticket
  // system (Redis-backed, single-use, 30s TTL) to replace query param auth.
  const url = req.url ?? "";
  const qmark = url.indexOf("?");
  if (qmark !== -1) {
    const params = new URLSearchParams(url.slice(qmark + 1));
    const queryKey = params.get("apiKey");
    if (queryKey && queryKey.length > 0) {
      return queryKey;
    }
  }
  return null;
}

export function extractInstanceId(req: IncomingMessage): string | undefined {
  const header = req.headers["x-instance-id"];
  return typeof header === "string" && header.length > 0 ? header : undefined;
}

async function tryApiKeyAuth(req: IncomingMessage): Promise<AuthenticatedPrincipal | null> {
  const rawKey = extractRawKey(req);
  if (!rawKey) return null;

  const keyHash = hashApiKey(rawKey);
  const record = await db.apiKey.findUnique({
    where: { key_hash: keyHash },
    include: { user: { select: { role: true } } },
  });

  if (!record) return null;
  if (record.expires_at !== null && record.expires_at < new Date()) return null;

  return {
    userId: record.user_id,
    role: record.user.role,
    instanceId: extractInstanceId(req),
    apiKeyId: record.id,
    authMethod: "api_key",
  };
}

async function trySessionAuth(req: IncomingMessage): Promise<AuthenticatedPrincipal | null> {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      }
    }

    const session = await auth.api.getSession({ headers });
    if (!session?.session || !session?.user) return null;

    return {
      userId: session.user.id,
      role: (session.user as unknown as { role: string }).role as AuthenticatedPrincipal["role"],
      instanceId: extractInstanceId(req),
      sessionId: session.session.id,
      authMethod: "session",
    };
  } catch {
    return null;
  }
}

/**
 * Try ticket-based auth — preferred method for WebSocket connections.
 * Tickets are short-lived (30s), single-use, Redis-backed tokens.
 */
async function tryTicketAuth(req: IncomingMessage): Promise<AuthenticatedPrincipal | null> {
  const url = req.url ?? "";
  const qmark = url.indexOf("?");
  if (qmark === -1) return null;

  const params = new URLSearchParams(url.slice(qmark + 1));
  const ticket = params.get("ticket");
  if (!ticket || ticket.length === 0) return null;

  const payload = await consumeTicket(ticket);
  if (!payload) return null;

  return {
    userId: payload.userId,
    role: payload.role as AuthenticatedPrincipal["role"],
    instanceId: extractInstanceId(req),
    apiKeyId: payload.apiKeyId,
    sessionId: payload.sessionId,
    authMethod: payload.authMethod,
  };
}

export async function authenticateUpgrade(req: IncomingMessage): Promise<AuthenticatedPrincipal> {
  // 1. Ticket-based auth (preferred — no secrets in URLs/logs)
  const ticketAuth = await tryTicketAuth(req);
  if (ticketAuth) return ticketAuth;

  // 2. API key via header (X-Api-Key)
  const apiKeyAuth = await tryApiKeyAuth(req);
  if (apiKeyAuth) return apiKeyAuth;

  // 3. Session cookie
  const sessionAuth = await trySessionAuth(req);
  if (sessionAuth) return sessionAuth;

  throw new AuthError(
    "Authentication required. Use a WebSocket ticket (POST /api/v1/ws/ticket), API key header, or sign in via the web interface.",
    "MISSING_AUTH",
  );
}
