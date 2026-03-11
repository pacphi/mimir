/**
 * Fetches a single-use WebSocket ticket from the API.
 *
 * Tickets are short-lived (30s) and single-use — each WebSocket connection
 * needs its own ticket. Call this function before every `new WebSocket()`.
 *
 * Returns `null` if the request fails (e.g. not authenticated).
 */
export async function fetchWsTicket(): Promise<string | null> {
  try {
    const res = await fetch("/api/v1/ws/ticket", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket: string };
    return data.ticket;
  } catch {
    return null;
  }
}
