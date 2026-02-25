import type { Profile } from "@/types/profile";
import { apiFetch } from "@/lib/api-fetch";

export const profilesApi = {
  listProfiles(): Promise<{ profiles: Profile[] }> {
    return apiFetch<{ profiles: Profile[] }>("/profiles");
  },
};
