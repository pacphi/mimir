import { useState } from "react";
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

function generateBaselineYaml(name: string, provider: string, extensions: string[]): string {
  const lines = [
    `name: ${name || "my-instance"}`,
    `provider: ${provider}`,
    "",
    "resources:",
    "  vcpus: 2",
    "  memory_gb: 4",
    "  storage_gb: 20",
    "",
  ];
  if (extensions.length === 0) {
    lines.push("extensions: []");
  } else {
    lines.push("extensions:");
    for (const ext of extensions) lines.push(`  - ${ext}`);
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

  const profiles = profilesData?.profiles ?? [];
  const profilesUnavailable =
    !profilesLoading && (profilesError || profilesData?.unavailable === true);
  const categories = [
    "All",
    ...(!categoriesLoading && categoryData
      ? categoryData.map((c: RegistryCategory) => c.category)
      : []),
  ];
  const extensions = extensionData?.extensions ?? [];
  const extensionsUnavailable =
    !extensionsLoading && (extensionsError || extensionData?.unavailable === true);
  const selectedExtensions = config.selectedExtensions ?? [];

  function handleSelectProvider(providerId: string) {
    // Changing provider resets extensions and profile — start from a clean baseline
    setActiveProfileName(null);
    const yaml = generateBaselineYaml(config.name, providerId, []);
    onChange({ provider: providerId, selectedExtensions: [], yamlConfig: yaml });
  }

  function handleSelectProfile(profileName: string) {
    if (activeProfileName === profileName) {
      // Toggle off — clear extensions from this profile
      setActiveProfileName(null);
      const yaml = generateBaselineYaml(config.name, config.provider, []);
      onChange({ selectedExtensions: [], yamlConfig: yaml });
      return;
    }
    const profile = profiles?.find((p) => p.name === profileName);
    if (!profile) return;
    setActiveProfileName(profileName);
    const newExtensions = [...profile.extensions];
    const yaml = generateBaselineYaml(config.name, config.provider, newExtensions);
    onChange({ selectedExtensions: newExtensions, yamlConfig: yaml });
  }

  function handleToggleExtension(extName: string) {
    const next = selectedExtensions.includes(extName)
      ? selectedExtensions.filter((e) => e !== extName)
      : [...selectedExtensions, extName];
    // Selecting/deselecting individual extensions clears the active profile shortcut
    setActiveProfileName(null);
    const yaml = generateBaselineYaml(config.name, config.provider, next);
    onChange({ selectedExtensions: next, yamlConfig: yaml });
  }

  function handleRemoveExtension(extName: string) {
    const next = selectedExtensions.filter((e) => e !== extName);
    setActiveProfileName(null);
    const yaml = generateBaselineYaml(config.name, config.provider, next);
    onChange({ selectedExtensions: next, yamlConfig: yaml });
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

      {/* ── B. Provider Selection ──────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-medium mb-3">
          Provider <span className="text-destructive">*</span>
        </h3>
        {providersData && providersData.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {providersData.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={cn(
                  "rounded-md border p-3 text-left transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring",
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
                <p className="text-xs text-muted-foreground leading-snug">{provider.description}</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading providers…</p>
        )}
      </div>

      {/* ── C. Profile Shortcuts ───────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-medium mb-1">Quick-start with a profile</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Select a profile to pre-populate extensions (mirrors{" "}
          <code className="font-mono">sindri profiles list</code>)
        </p>
        {profilesLoading ? (
          <p className="text-sm text-muted-foreground">Loading profiles…</p>
        ) : profilesUnavailable ? (
          <p className="text-sm text-muted-foreground">
            Profiles unavailable — build the <code className="font-mono">sindri</code> binary and
            restart the stack.
          </p>
        ) : profiles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
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
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
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
          <p className="text-sm text-muted-foreground">No profiles found.</p>
        )}
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
            {selectedExtensions.map((ext) => (
              <span
                key={ext}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {ext}
                <button
                  type="button"
                  onClick={() => handleRemoveExtension(ext)}
                  className="rounded-full hover:bg-primary/20 p-0.5 -mr-0.5"
                  aria-label={`Remove ${ext}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Category filter + Search */}
        <div className="flex gap-2 mb-2 flex-wrap items-center">
          <div className="flex gap-1 flex-wrap">
            {categories.map((cat) => (
              <Button
                key={cat}
                variant={categoryFilter === cat ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>
          <Input
            className="h-7 text-xs w-44 ml-auto"
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
          ) : extensions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {search ? "No extensions match your search" : "No extensions found."}
            </p>
          ) : (
            extensions.map((ext) => {
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
