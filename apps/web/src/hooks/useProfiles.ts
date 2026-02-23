import { useQuery } from "@tanstack/react-query";
import { profilesApi } from "@/api/profiles";

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: () => profilesApi.listProfiles().then((r) => r.profiles),
    staleTime: 300_000,
  });
}
