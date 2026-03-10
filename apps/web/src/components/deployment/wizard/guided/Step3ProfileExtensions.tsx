import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDeploymentWizardStore } from "@/stores/deploymentWizardStore";

// ─── Registry API shapes ─────────────────────────────────────────────────────

interface RegistryExtension {
  name: string;
  category: string;
  version?: string;
  description?: string;
  status?: string;
}

interface RegistryCategory {
  category: string;
  count: number;
}

interface RegistryProfile {
  name: string;
  description: string;
  extensions: string[];
  extension_count: number;
}

interface CliUnavailableResponse {
  error: "CLI_UNAVAILABLE";
  message: string;
  fallback: true;
}

const REQUIRED_EXTENSIONS = ["draupnir"];

function ensureDraupnir(extensions: string[]): string[] {
  const next = [...extensions];
  for (const req of REQUIRED_EXTENSIONS) {
    if (!next.includes(req)) next.push(req);
  }
  return next.sort((a, b) => a.localeCompare(b));
}

// ─── Horizontal scroll ─────────────────────────────────────────────────────

function useHorizontalScrollIndicators(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [update, dep]);

  const scrollBy = useCallback((delta: number) => {
    ref.current?.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  return { ref, canScrollLeft, canScrollRight, scrollBy };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function Step3ProfileExtensions() {
  const {
    profileName,
    profileExtensions,
    selectedExtensions,
    setProfileName,
    setProfileExtensions,
    setSelectedExtensions,
  } = useDeploymentWizardStore();

  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  const categoryScroll = useHorizontalScrollIndicators(categoryFilter);

  // Fetch profiles
  const {
    data: profilesData,
    isLoading: profilesLoading,
    isError: profilesError,
  } = useQuery({
    queryKey: ["registry", "profiles"],
    queryFn: () =>
      fetch("/api/v1/registry/profiles", { headers: { "Content-Type": "application/json" } })
        .then((r) => r.json())
        .then((d: { profiles: RegistryProfile[] } | CliUnavailableResponse) => {
          if ("fallback" in d) return { profiles: [] as RegistryProfile[], unavailable: true };
          return { profiles: d.profiles, unavailable: false };
        }),
    staleTime: 300_000,
  });

  // Fetch categories
  const { data: categoryData, isLoading: categoriesLoading } = useQuery({
    queryKey: ["registry", "extensions", "categories"],
    queryFn: () =>
      fetch("/api/v1/registry/extensions/categories", {
        headers: { "Content-Type": "application/json" },
      })
        .then((r) => r.json())
        .then((d: { categories: RegistryCategory[] } | CliUnavailableResponse) =>
          "fallback" in d ? [] : d.categories,
        ),
    staleTime: 300_000,
  });

  // Fetch extensions
  const params = new URLSearchParams();
  if (categoryFilter !== "All") params.set("category", categoryFilter);
  if (search) params.set("search", search);
  const extensionQueryString = params.toString();

  const {
    data: extensionData,
    isLoading: extensionsLoading,
    isError: extensionsError,
  } = useQuery({
    queryKey: ["registry", "extensions", categoryFilter, search],
    queryFn: () =>
      fetch(
        `/api/v1/registry/extensions${extensionQueryString ? `?${extensionQueryString}` : ""}`,
        { headers: { "Content-Type": "application/json" } },
      )
        .then((r) => r.json())
        .then((d: { extensions: RegistryExtension[]; total: number } | CliUnavailableResponse) => {
          if ("fallback" in d)
            return { extensions: [] as RegistryExtension[], total: 0, unavailable: true };
          return { ...d, unavailable: false };
        }),
    staleTime: 60_000,
  });

  const profiles = [...(profilesData?.profiles ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const profilesUnavailable =
    !profilesLoading && (profilesError || profilesData?.unavailable === true);
  const categories = [
    "All",
    ...(!categoriesLoading && categoryData
      ? categoryData.map((c: RegistryCategory) => c.category).sort((a, b) => a.localeCompare(b))
      : []),
  ];
  const extensions = [...(extensionData?.extensions ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const extensionsUnavailable =
    !extensionsLoading && (extensionsError || extensionData?.unavailable === true);

  function handleSelectProfile(name: string) {
    if (profileName === name) {
      // Deselect
      setProfileName(null);
      setProfileExtensions([]);
      setSelectedExtensions(ensureDraupnir([]));
      return;
    }
    const profile = profiles.find((p) => p.name === name);
    if (!profile) return;
    setProfileName(name);
    setProfileExtensions([...profile.extensions]);
    setSelectedExtensions(ensureDraupnir([...profile.extensions]));
  }

  function handleToggleExtension(extName: string) {
    const has = selectedExtensions.includes(extName);
    const next = has
      ? selectedExtensions.filter((e) => e !== extName)
      : [...selectedExtensions, extName].sort();
    const withRequired = ensureDraupnir(next);
    // Only clear profile if removing an extension that belongs to the profile
    if (has && profileExtensions.includes(extName)) {
      setProfileName(null);
      setProfileExtensions([]);
    }
    setSelectedExtensions(withRequired);
  }

  function handleRemoveExtension(extName: string) {
    if (REQUIRED_EXTENSIONS.includes(extName)) return;
    const next = selectedExtensions.filter((e) => e !== extName);
    // Only clear profile if removing a profile-owned extension
    if (profileExtensions.includes(extName)) {
      setProfileName(null);
      setProfileExtensions([]);
    }
    setSelectedExtensions(next);
  }

  return (
    <div className="space-y-6">
      {/* Profile selector */}
      <div>
        <h3 className="text-sm font-medium mb-2">Profile</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Select a profile to pre-populate extensions
        </p>
        {profilesLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : profilesUnavailable ? (
          <p className="text-xs text-muted-foreground">Unavailable</p>
        ) : profiles.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((profile) => (
              <button
                key={profile.name}
                type="button"
                onClick={() => handleSelectProfile(profile.name)}
                title={`${profile.description} (${profile.extension_count} extensions)`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  profileName === profile.name
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:border-primary",
                )}
              >
                {profile.name}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    profileName === profile.name
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {profile.extension_count}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">None found.</p>
        )}
      </div>

      {/* Extensions */}
      <div>
        <h3 className="text-sm font-medium mb-1">Extensions</h3>
        <p className="text-xs text-muted-foreground mb-2">
          draupnir is always included for Mimir connectivity
        </p>

        {/* Selected chips */}
        {selectedExtensions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedExtensions.map((ext) => {
              const isRequired = REQUIRED_EXTENSIONS.includes(ext);
              return (
                <span
                  key={ext}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {ext}
                  {isRequired ? (
                    <svg
                      className="w-3 h-3 text-primary/50"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRemoveExtension(ext)}
                      className="rounded-full hover:bg-primary/20 p-0.5 -mr-0.5"
                      aria-label={`Remove ${ext}`}
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Category filter + search */}
        <div className="flex gap-2 mb-2 items-center">
          <Button
            variant={categoryFilter === "All" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2.5 shrink-0"
            onClick={() => setCategoryFilter("All")}
          >
            All
          </Button>
          <div
            ref={categoryScroll.ref}
            className="flex gap-1 overflow-x-auto flex-nowrap flex-1 min-w-0 scrollbar-none"
          >
            {categories
              .filter((cat) => cat !== "All")
              .map((cat) => (
                <Button
                  key={cat}
                  variant={categoryFilter === cat ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-2.5 shrink-0 whitespace-nowrap"
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat}
                </Button>
              ))}
          </div>
          <Input
            className="h-7 text-xs w-44 shrink-0"
            placeholder="Search extensions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Extension list */}
        <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
          {extensionsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading extensions...</p>
          ) : extensionsUnavailable ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Extensions unavailable — build the <code className="font-mono">sindri</code> binary
              and restart.
            </p>
          ) : extensions.filter((ext) => !REQUIRED_EXTENSIONS.includes(ext.name)).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {search ? "No extensions match your search" : "No extensions found."}
            </p>
          ) : (
            extensions
              .filter((ext) => !REQUIRED_EXTENSIONS.includes(ext.name))
              .map((ext) => {
                const checked = selectedExtensions.includes(ext.name);
                return (
                  <label
                    key={ext.name}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors",
                      checked && "bg-primary/5",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0"
                      checked={checked}
                      onChange={() => handleToggleExtension(ext.name)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{ext.name}</span>
                        <span className="inline-block text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded shrink-0">
                          {ext.category}
                        </span>
                      </div>
                      {ext.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {ext.description}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
}
