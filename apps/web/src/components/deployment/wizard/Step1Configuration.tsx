import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SindriYamlEditor } from "@/components/deployment/SindriYamlEditor";
import type { DeploymentConfig } from "@/types/deployment";

// ─────────────────────────────────────────────────────────────────────────────
// Registry API response shapes
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// YAML generation
// ─────────────────────────────────────────────────────────────────────────────

/** Extensions that are always included and cannot be removed by the user. */
const REQUIRED_EXTENSIONS = ["draupnir"];

function ensureDraupnir(extensions: string[]): string[] {
  const next = [...extensions];
  for (const req of REQUIRED_EXTENSIONS) {
    if (!next.includes(req)) next.push(req);
  }
  return next.sort((a, b) => a.localeCompare(b));
}

function generateBaselineYaml(
  name: string,
  provider: string,
  extensions: string[],
  profileName: string | null,
  profileExtensions: string[],
): string {
  const lines = [
    'version: "1.0"',
    `name: ${name || "my-instance"}`,
    "",
    "deployment:",
    `  provider: ${provider}`,
    "  resources:",
    '    memory: "4GB"',
    "    cpus: 2",
    "",
    "extensions:",
  ];

  if (profileName) {
    // Profile-based: use profile + additional for any extras not in the profile
    lines.push(`  profile: ${profileName}`);
    const additional = ensureDraupnir(extensions).filter((ext) => !profileExtensions.includes(ext));
    if (additional.length > 0) {
      lines.push("  additional:");
      for (const ext of additional) lines.push(`    - ${ext}`);
    }
  } else {
    // Explicit list: use active
    const active = ensureDraupnir(extensions);
    lines.push("  active:");
    for (const ext of active) lines.push(`    - ${ext}`);
  }

  return lines.join("\n") + "\n";
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider icon labels
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, string> = {
  fly: "F",
  docker: "D",
  devpod: "P",
  e2b: "E",
  kubernetes: "K",
  runpod: "R",
  northflank: "N",
};

// ─────────────────────────────────────────────────────────────────────────────
// Scrollable column with up/down indicators
// ─────────────────────────────────────────────────────────────────────────────

function useScrollIndicators(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [update, dep]);

  const scrollBy = useCallback((delta: number) => {
    ref.current?.scrollBy({ top: delta, behavior: "smooth" });
  }, []);

  return { ref, canScrollUp, canScrollDown, scrollBy };
}

function ScrollIndicatorButton({
  direction,
  visible,
  onClick,
}: {
  direction: "up" | "down";
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center w-full h-6 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all rounded-md",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
      aria-label={`Scroll ${direction}`}
      tabIndex={visible ? 0 : -1}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={direction === "up" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
        />
      </svg>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Horizontal scroll indicators
// ─────────────────────────────────────────────────────────────────────────────

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

function HorizontalScrollButton({
  direction,
  visible,
  onClick,
}: {
  direction: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center w-6 h-7 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all rounded-md shrink-0",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
      aria-label={`Scroll ${direction}`}
      tabIndex={visible ? 0 : -1}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={direction === "left" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"}
        />
      </svg>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface Step1ConfigurationProps {
  config: DeploymentConfig;
  onChange: (updates: Partial<DeploymentConfig>) => void;
}

export function Step1Configuration({ config, onChange }: Step1ConfigurationProps) {
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);

  const providerScroll = useScrollIndicators(null);
  const categoryScroll = useHorizontalScrollIndicators(categoryFilter);

  const { data: providersData } = useQuery({
    queryKey: ["providers"],
    queryFn: () =>
      fetch("/api/v1/providers", {
        headers: { "Content-Type": "application/json" },
      })
        .then((r) => r.json())
        .then(
          (d: { providers: Array<{ id: string; name: string; description: string }> }) =>
            d.providers,
        ),
    staleTime: 300_000,
  });

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

  const providers = [...(providersData ?? [])].sort((a, b) => a.name.localeCompare(b.name));
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
  const selectedExtensions = config.selectedExtensions ?? [];

  function handleSelectProvider(providerId: string) {
    // Changing provider resets extensions and profile — start from a clean baseline
    setActiveProfileName(null);
    const exts = ensureDraupnir([]);
    const yaml = generateBaselineYaml(config.name, providerId, exts, null, []);
    onChange({ provider: providerId, selectedExtensions: exts, yamlConfig: yaml });
  }

  function handleSelectProfile(profileName: string) {
    if (activeProfileName === profileName) {
      // Toggle off — clear extensions from this profile
      setActiveProfileName(null);
      const exts = ensureDraupnir([]);
      const yaml = generateBaselineYaml(config.name, config.provider, exts, null, []);
      onChange({ selectedExtensions: exts, yamlConfig: yaml });
      return;
    }
    const profile = profiles?.find((p) => p.name === profileName);
    if (!profile) return;
    setActiveProfileName(profileName);
    const newExtensions = ensureDraupnir([...profile.extensions]);
    const yaml = generateBaselineYaml(
      config.name,
      config.provider,
      newExtensions,
      profileName,
      profile.extensions,
    );
    onChange({ selectedExtensions: newExtensions, yamlConfig: yaml });
  }

  function handleToggleExtension(extName: string) {
    const next = selectedExtensions.includes(extName)
      ? selectedExtensions.filter((e) => e !== extName)
      : [...selectedExtensions, extName].sort((a, b) => a.localeCompare(b));
    const withRequired = ensureDraupnir(next);
    // Selecting/deselecting individual extensions clears the active profile shortcut
    setActiveProfileName(null);
    const yaml = generateBaselineYaml(config.name, config.provider, withRequired, null, []);
    onChange({ selectedExtensions: withRequired, yamlConfig: yaml });
  }

  function handleRemoveExtension(extName: string) {
    if (REQUIRED_EXTENSIONS.includes(extName)) return;
    const next = selectedExtensions.filter((e) => e !== extName);
    // If removing an extension that was part of the active profile, clear the profile
    const activeProfile = activeProfileName
      ? profiles?.find((p) => p.name === activeProfileName)
      : null;
    if (activeProfile && activeProfile.extensions.includes(extName)) {
      // Extension was part of the profile — switch to explicit active list
      setActiveProfileName(null);
      const yaml = generateBaselineYaml(config.name, config.provider, next, null, []);
      onChange({ selectedExtensions: next, yamlConfig: yaml });
    } else if (activeProfileName && activeProfile) {
      // Extension was additional — keep profile mode
      const yaml = generateBaselineYaml(
        config.name,
        config.provider,
        next,
        activeProfileName,
        activeProfile.extensions,
      );
      onChange({ selectedExtensions: next, yamlConfig: yaml });
    } else {
      setActiveProfileName(null);
      const yaml = generateBaselineYaml(config.name, config.provider, next, null, []);
      onChange({ selectedExtensions: next, yamlConfig: yaml });
    }
  }

  function handleYamlChange(value: string) {
    onChange({ yamlConfig: value });
  }

  return (
    <div className="space-y-6">
      {/* ── A. Deployment Name ─────────────────────────────────────────── */}
      <div>
        <label className="text-sm font-medium" htmlFor="deployment-name">
          Deployment Name
        </label>
        <Input
          id="deployment-name"
          className="mt-1.5"
          placeholder="my-instance"
          value={config.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Lowercase letters, numbers, and hyphens only
        </p>
      </div>

      {/* ── B+C. Provider (scrollable) & Profile (tags) — side by side ─ */}
      <div className="grid grid-cols-[1fr_auto] gap-8 items-start">
        {/* ── Provider column ──────────────────────────────────────────── */}
        <div className="flex flex-col min-w-0">
          <h3 className="text-sm font-medium mb-2">
            Provider <span className="text-destructive">*</span>
          </h3>
          {providers.length > 0 ? (
            <div className="flex flex-col min-h-0">
              <ScrollIndicatorButton
                direction="up"
                visible={providerScroll.canScrollUp}
                onClick={() => providerScroll.scrollBy(-120)}
              />
              <div
                ref={providerScroll.ref}
                className="flex flex-col gap-2 overflow-y-auto max-h-60 px-0.5 py-0.5"
              >
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    className={cn(
                      "rounded-md border p-3 text-left transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring shrink-0",
                      config.provider === provider.id
                        ? "border-primary bg-primary/5"
                        : "border-input bg-background",
                    )}
                    onClick={() => handleSelectProvider(provider.id)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={cn(
                          "w-6 h-6 rounded text-xs font-bold flex items-center justify-center shrink-0",
                          config.provider === provider.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {PROVIDER_ICONS[provider.id] ?? provider.name[0]}
                      </div>
                      <span className="text-sm font-medium truncate">{provider.name}</span>
                      {config.provider === provider.id && (
                        <svg
                          className="w-3.5 h-3.5 text-primary shrink-0 ml-auto"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      {provider.description}
                    </p>
                  </button>
                ))}
              </div>
              <ScrollIndicatorButton
                direction="down"
                visible={providerScroll.canScrollDown}
                onClick={() => providerScroll.scrollBy(120)}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading providers…</p>
          )}
        </div>

        {/* ── Profile column (compact tags) ────────────────────────────── */}
        <div className="flex flex-col">
          <h3 className="text-sm font-medium mb-2">Profile</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Select a profile to pre-populate extensions
          </p>
          {profilesLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : profilesUnavailable ? (
            <p className="text-xs text-muted-foreground">Unavailable</p>
          ) : profiles.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {profiles.map((profile) => (
                <button
                  key={profile.name}
                  type="button"
                  onClick={() => handleSelectProfile(profile.name)}
                  title={`${profile.description} (${profile.extension_count} extensions)`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    activeProfileName === profile.name
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:border-primary",
                  )}
                >
                  {profile.name}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold ml-auto",
                      activeProfileName === profile.name
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
      </div>

      {/* ── D. Extension Multi-Select ──────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-medium mb-1">Extensions</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Optional — mirrors <code className="font-mono">sindri extensions list</code>
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
                  title={isRequired ? "Required for Mimir connectivity" : undefined}
                >
                  {ext}
                  {isRequired ? (
                    <svg
                      className="w-3 h-3 text-primary/50"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-label="Required extension"
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

        {/* Category filter (All fixed, rest horizontal scroll) + Search */}
        <div className="flex gap-2 mb-2 items-center">
          <Button
            variant={categoryFilter === "All" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2.5 shrink-0"
            onClick={() => setCategoryFilter("All")}
          >
            All
          </Button>
          <HorizontalScrollButton
            direction="left"
            visible={categoryScroll.canScrollLeft}
            onClick={() => categoryScroll.scrollBy(-120)}
          />
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
          <HorizontalScrollButton
            direction="right"
            visible={categoryScroll.canScrollRight}
            onClick={() => categoryScroll.scrollBy(120)}
          />
          <Input
            className="h-7 text-xs w-44 shrink-0"
            placeholder="Search extensions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Extension list */}
        <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
          {extensionsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading extensions…</p>
          ) : extensionsUnavailable ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Extensions unavailable — build the <code className="font-mono">sindri</code> binary
              and restart the stack.
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

      {/* ── E. YAML Editor ────────────────────────────────────────────── */}
      <div>
        <label className="text-sm font-medium block mb-2">Configuration YAML</label>
        <SindriYamlEditor value={config.yamlConfig} onChange={handleYamlChange} height={320} />
      </div>
    </div>
  );
}
