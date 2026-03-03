import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <Label className="text-xs">Compute Plan</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="nf-compute-100"
          value={(options.computePlan as string) ?? ""}
          onChange={(e) => onChange("computePlan", e.target.value || undefined)}
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
    </div>
  );
}
