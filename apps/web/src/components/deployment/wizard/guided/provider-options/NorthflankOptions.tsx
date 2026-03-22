import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ProviderOptionsProps } from ".";

export function NorthflankOptions({ options, onChange }: ProviderOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs">Project Name</Label>
        <Input
          className="mt-1"
          placeholder="my-project"
          value={(options.projectName as string) ?? ""}
          onChange={(e) => onChange("projectName", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Instances</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="1"
          value={(options.instances as number) ?? ""}
          onChange={(e) =>
            onChange("instances", e.target.value ? Number(e.target.value) : undefined)
          }
        />
      </div>
      <div>
        <Label className="text-xs">GPU Type</Label>
        <Input
          className="mt-1"
          placeholder="Optional"
          value={(options.gpuType as string) ?? ""}
          onChange={(e) => onChange("gpuType", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Registry Credentials</Label>
        <Input
          className="mt-1"
          placeholder="Optional"
          value={(options.registryCredentials as string) ?? ""}
          onChange={(e) => onChange("registryCredentials", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Health Check Path</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="/health"
          value={(options.healthCheck as { path?: string })?.path ?? ""}
          onChange={(e) =>
            onChange("healthCheck", {
              ...((options.healthCheck as Record<string, unknown>) ?? {}),
              path: e.target.value || undefined,
            })
          }
        />
      </div>
      <div>
        <Label className="text-xs">Health Check Port</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="Optional"
          value={(options.healthCheck as { port?: number })?.port ?? ""}
          onChange={(e) =>
            onChange("healthCheck", {
              ...((options.healthCheck as Record<string, unknown>) ?? {}),
              port: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>
      <div className="col-span-2 space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.autoScaling as { enabled?: boolean })?.enabled ?? false}
            onCheckedChange={(v) =>
              onChange("autoScaling", {
                ...((options.autoScaling as Record<string, unknown>) ?? {}),
                enabled: v,
              })
            }
          />
          <Label className="text-xs">Auto Scaling</Label>
        </div>
        {(options.autoScaling as { enabled?: boolean })?.enabled && (
          <div className="grid grid-cols-3 gap-4 pl-6">
            <div>
              <Label className="text-xs">Min Instances</Label>
              <Input
                className="mt-1"
                type="number"
                placeholder="1"
                value={(options.autoScaling as { min?: number })?.min ?? ""}
                onChange={(e) =>
                  onChange("autoScaling", {
                    ...((options.autoScaling as Record<string, unknown>) ?? {}),
                    min: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Max Instances</Label>
              <Input
                className="mt-1"
                type="number"
                placeholder="3"
                value={(options.autoScaling as { max?: number })?.max ?? ""}
                onChange={(e) =>
                  onChange("autoScaling", {
                    ...((options.autoScaling as Record<string, unknown>) ?? {}),
                    max: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Target CPU %</Label>
              <Input
                className="mt-1"
                type="number"
                placeholder="70"
                value={(options.autoScaling as { targetCpu?: number })?.targetCpu ?? ""}
                onChange={(e) =>
                  onChange("autoScaling", {
                    ...((options.autoScaling as Record<string, unknown>) ?? {}),
                    targetCpu: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
