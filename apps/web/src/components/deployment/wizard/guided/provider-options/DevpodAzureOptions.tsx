import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProviderOptionsProps } from ".";

export function DevpodAzureOptions({ options, onChange }: ProviderOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs">Subscription ID</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="00000000-0000-0000-0000-000000000000"
          value={(options.subscription as string) ?? ""}
          onChange={(e) => onChange("subscription", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Resource Group</Label>
        <Input
          className="mt-1"
          placeholder="my-resource-group"
          value={(options.resourceGroup as string) ?? ""}
          onChange={(e) => onChange("resourceGroup", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Location</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="eastus"
          value={(options.location as string) ?? ""}
          onChange={(e) => onChange("location", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">VM Size</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="Standard_D2s_v3"
          value={(options.vmSize as string) ?? ""}
          onChange={(e) => onChange("vmSize", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Disk Size (GB)</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="128"
          value={(options.diskSize as number) ?? ""}
          onChange={(e) =>
            onChange("diskSize", e.target.value ? Number(e.target.value) : undefined)
          }
        />
      </div>
    </div>
  );
}
