import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProviderOptionsProps } from ".";

export function DevpodDigitaloceanOptions({ options, onChange }: ProviderOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs">Droplet Size</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="s-4vcpu-8gb"
          value={(options.size as string) ?? ""}
          onChange={(e) => onChange("size", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Disk Size (GB)</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="Optional"
          value={(options.diskSize as number) ?? ""}
          onChange={(e) =>
            onChange("diskSize", e.target.value ? Number(e.target.value) : undefined)
          }
        />
      </div>
    </div>
  );
}
