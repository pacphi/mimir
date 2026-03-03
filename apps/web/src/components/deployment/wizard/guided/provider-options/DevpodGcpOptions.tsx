import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProviderOptionsProps } from ".";

export function DevpodGcpOptions({ options, onChange }: ProviderOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs">Project</Label>
        <Input
          className="mt-1"
          placeholder="my-gcp-project"
          value={(options.project as string) ?? ""}
          onChange={(e) => onChange("project", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Zone</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="us-central1-a"
          value={(options.zone as string) ?? ""}
          onChange={(e) => onChange("zone", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Machine Type</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="e2-medium"
          value={(options.machineType as string) ?? ""}
          onChange={(e) => onChange("machineType", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Disk Size (GB)</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="50"
          value={(options.diskSize as number) ?? ""}
          onChange={(e) =>
            onChange("diskSize", e.target.value ? Number(e.target.value) : undefined)
          }
        />
      </div>
      <div>
        <Label className="text-xs">Disk Type</Label>
        <Select
          value={(options.diskType as string) ?? ""}
          onValueChange={(v) => onChange("diskType", v || undefined)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pd-standard">Standard</SelectItem>
            <SelectItem value="pd-ssd">SSD</SelectItem>
            <SelectItem value="pd-balanced">Balanced</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
