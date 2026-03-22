import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProviderOptionsProps } from ".";

export function RunpodOptions({ options, onChange }: ProviderOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs">GPU Type ID</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="NVIDIA RTX 4090"
          value={(options.gpuTypeId as string) ?? ""}
          onChange={(e) => onChange("gpuTypeId", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">GPU Count</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="1"
          value={(options.gpuCount as number) ?? ""}
          onChange={(e) =>
            onChange("gpuCount", e.target.value ? Number(e.target.value) : undefined)
          }
        />
      </div>
      <div>
        <Label className="text-xs">Container Disk (GB)</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="20"
          value={(options.containerDiskGb as number) ?? ""}
          onChange={(e) =>
            onChange("containerDiskGb", e.target.value ? Number(e.target.value) : undefined)
          }
        />
      </div>
      <div>
        <Label className="text-xs">Volume Size (GB)</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="50"
          value={(options.volumeSizeGb as number) ?? ""}
          onChange={(e) =>
            onChange("volumeSizeGb", e.target.value ? Number(e.target.value) : undefined)
          }
        />
      </div>
      <div>
        <Label className="text-xs">Volume Mount Path</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="/workspace"
          value={(options.volumeMountPath as string) ?? ""}
          onChange={(e) => onChange("volumeMountPath", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Cloud Type</Label>
        <Select
          value={(options.cloudType as string) ?? ""}
          onValueChange={(v) => onChange("cloudType", v || undefined)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="COMMUNITY">Community</SelectItem>
            <SelectItem value="SECURE">Secure</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Spot Bid ($)</Label>
        <Input
          className="mt-1"
          type="number"
          step="0.01"
          placeholder="0 (on-demand)"
          value={(options.spotBid as number) ?? ""}
          onChange={(e) => onChange("spotBid", e.target.value ? Number(e.target.value) : undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Expose Ports (comma-separated)</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="8080, 8888"
          value={((options.exposePorts as string[]) ?? []).join(", ")}
          onChange={(e) =>
            onChange(
              "exposePorts",
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
        <Label className="text-xs">CPU Instance ID</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="Required if CPU Only"
          value={(options.cpuInstanceId as string) ?? ""}
          onChange={(e) => onChange("cpuInstanceId", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Template ID</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="Optional"
          value={(options.templateId as string) ?? ""}
          onChange={(e) => onChange("templateId", e.target.value || undefined)}
        />
      </div>
      <div className="space-y-3 pt-5">
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.startSsh as boolean) ?? false}
            onCheckedChange={(v) => onChange("startSsh", v)}
          />
          <Label className="text-xs">Start SSH</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.cpuOnly as boolean) ?? false}
            onCheckedChange={(v) => onChange("cpuOnly", v)}
          />
          <Label className="text-xs">CPU Only</Label>
        </div>
      </div>
    </div>
  );
}
