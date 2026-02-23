import type { Profile } from "@/types/profile";

const API_BASE = "/api/v1";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error((err as { message?: string }).message ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const profilesApi = {
  listProfiles(): Promise<{ profiles: Profile[] }> {
    return apiFetch<{ profiles: Profile[] }>("/profiles");
  },
};
