import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ProviderOptionsProps } from ".";

export function E2bOptions({ options, onChange }: ProviderOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs">Timeout (seconds)</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="300"
          value={(options.timeout as number) ?? ""}
          onChange={(e) => onChange("timeout", e.target.value ? Number(e.target.value) : undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Team</Label>
        <Input
          className="mt-1"
          placeholder="my-team"
          value={(options.team as string) ?? ""}
          onChange={(e) => onChange("team", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Template Alias</Label>
        <Input
          className="mt-1"
          placeholder="custom-template"
          value={(options.templateAlias as string) ?? ""}
          onChange={(e) => onChange("templateAlias", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Metadata (key=value, comma-separated)</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="team=ai-research, purpose=sandbox"
          value={
            options.metadata
              ? Object.entries(options.metadata as Record<string, string>)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")
              : ""
          }
          onChange={(e) => {
            if (!e.target.value) {
              onChange("metadata", undefined);
              return;
            }
            const parsed: Record<string, string> = {};
            for (const pair of e.target.value.split(",").map((s) => s.trim())) {
              const [k, ...rest] = pair.split("=");
              if (k && rest.length > 0) parsed[k.trim()] = rest.join("=").trim();
            }
            onChange("metadata", Object.keys(parsed).length > 0 ? parsed : undefined);
          }}
        />
      </div>
      <div>
        <Label className="text-xs">Allowed Domains (comma-separated)</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="api.example.com, cdn.example.com"
          value={((options.allowedDomains as string[]) ?? []).join(", ")}
          onChange={(e) =>
            onChange(
              "allowedDomains",
              e.target.value
                ? e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : undefined,
            )
          }
        />
      </div>
      <div>
        <Label className="text-xs">Blocked Domains (comma-separated)</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="evil.com"
          value={((options.blockedDomains as string[]) ?? []).join(", ")}
          onChange={(e) =>
            onChange(
              "blockedDomains",
              e.target.value
                ? e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : undefined,
            )
          }
        />
      </div>
      <div className="space-y-3 pt-5 col-span-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.autoPause as boolean) ?? false}
            onCheckedChange={(v) => onChange("autoPause", v)}
          />
          <Label className="text-xs">Auto Pause</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.autoResume as boolean) ?? false}
            onCheckedChange={(v) => onChange("autoResume", v)}
          />
          <Label className="text-xs">Auto Resume</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.internetAccess as boolean) ?? true}
            onCheckedChange={(v) => onChange("internetAccess", v)}
          />
          <Label className="text-xs">Internet Access</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.publicAccess as boolean) ?? false}
            onCheckedChange={(v) => onChange("publicAccess", v)}
          />
          <Label className="text-xs">Public Access</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.buildOnDeploy as boolean) ?? false}
            onCheckedChange={(v) => onChange("buildOnDeploy", v)}
          />
          <Label className="text-xs">Build on Deploy</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.reuseTemplate as boolean) ?? false}
            onCheckedChange={(v) => onChange("reuseTemplate", v)}
          />
          <Label className="text-xs">Reuse Template</Label>
        </div>
      </div>
    </div>
  );
}
