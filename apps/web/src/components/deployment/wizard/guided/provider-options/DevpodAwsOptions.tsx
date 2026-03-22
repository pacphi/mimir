import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ProviderOptionsProps } from ".";

export function DevpodAwsOptions({ options, onChange }: ProviderOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs">Instance Type</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="c5.xlarge"
          value={(options.instanceType as string) ?? ""}
          onChange={(e) => onChange("instanceType", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Disk Size (GB)</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="40"
          value={(options.diskSize as number) ?? ""}
          onChange={(e) =>
            onChange("diskSize", e.target.value ? Number(e.target.value) : undefined)
          }
        />
      </div>
      <div>
        <Label className="text-xs">Subnet ID</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="subnet-abc123"
          value={(options.subnet as string) ?? ""}
          onChange={(e) => onChange("subnet", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Security Group</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="sg-abc123"
          value={(options.securityGroup as string) ?? ""}
          onChange={(e) => onChange("securityGroup", e.target.value || undefined)}
        />
      </div>
      <div className="flex items-center gap-2 pt-5">
        <Switch
          checked={(options.useSpot as boolean) ?? false}
          onCheckedChange={(v) => onChange("useSpot", v)}
        />
        <Label className="text-xs">Use Spot Instances</Label>
      </div>
    </div>
  );
}
