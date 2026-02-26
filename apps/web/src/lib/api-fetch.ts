/**
 * Shared API fetch utility with session cookie support and 401 handling.
 */

const API_BASE = "/api/v1";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (response.status === 401) {
    // Only redirect to login if auth bypass is not active
    try {
      const configRes = await fetch("/api/config");
      const config = await configRes.json();
      if (!config.authBypass) {
        window.location.href = "/login";
      }
    } catch {
      window.location.href = "/login";
    }
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error((err as { message?: string }).message ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
