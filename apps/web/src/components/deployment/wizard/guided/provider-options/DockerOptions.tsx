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

export function DockerOptions({ options, onChange }: ProviderOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs">Network</Label>
        <Input
          className="mt-1"
          placeholder="bridge"
          value={(options.network as string) ?? ""}
          onChange={(e) => onChange("network", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Restart Policy</Label>
        <Select
          value={(options.restart as string) ?? ""}
          onValueChange={(v) => onChange("restart", v || undefined)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no">No</SelectItem>
            <SelectItem value="always">Always</SelectItem>
            <SelectItem value="on-failure">On Failure</SelectItem>
            <SelectItem value="unless-stopped">Unless Stopped</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Runtime</Label>
        <Input
          className="mt-1"
          placeholder="runc"
          value={(options.runtime as string) ?? ""}
          onChange={(e) => onChange("runtime", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Ports (comma-separated)</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="8080:80, 443:443"
          value={((options.ports as string[]) ?? []).join(", ")}
          onChange={(e) =>
            onChange(
              "ports",
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
            checked={(options.privileged as boolean) ?? false}
            onCheckedChange={(v) => onChange("privileged", v)}
          />
          <Label className="text-xs">Privileged Mode</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.dind as boolean) ?? false}
            onCheckedChange={(v) => onChange("dind", v)}
          />
          <Label className="text-xs">Docker-in-Docker</Label>
        </div>
      </div>
    </div>
  );
}
