/**
 * Terminal session persistence and audit logging.
 *
 * Provides callbacks for the WebSocket layer to record terminal session
 * lifecycle events (CONNECT / DISCONNECT) in the database and audit log.
 */

import { db } from "../lib/db.js";
import { createAuditLog } from "./audit.js";

/**
 * Create (or reactivate) a terminal session record and emit an audit log entry.
 */
export async function createTerminalSession(
  sessionId: string,
  instanceId: string,
  userId: string,
): Promise<void> {
  await db.terminalSession.upsert({
    where: { id: sessionId },
    create: {
      id: sessionId,
      instance_id: instanceId,
      user_id: userId,
      status: "ACTIVE",
    },
    update: {
      status: "ACTIVE",
      ended_at: null,
    },
  });

  await createAuditLog({
    user_id: userId,
    action: "CONNECT",
    resource: "terminal_session",
    resource_id: sessionId,
    metadata: { instanceId },
  });
}

/**
 * Mark a terminal session as closed and emit an audit log entry.
 */
export async function closeTerminalSession(sessionId: string, reason?: string): Promise<void> {
  const session = await db.terminalSession.findUnique({
    where: { id: sessionId },
    select: { user_id: true, instance_id: true },
  });

  await db.terminalSession.update({
    where: { id: sessionId },
    data: {
      status: "CLOSED",
      ended_at: new Date(),
    },
  });

  await createAuditLog({
    user_id: session?.user_id ?? undefined,
    action: "DISCONNECT",
    resource: "terminal_session",
    resource_id: sessionId,
    metadata: { instanceId: session?.instance_id, reason },
  });
}
