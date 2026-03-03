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

export function FlyOptions({ options, onChange }: ProviderOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs">CPU Kind</Label>
        <Select
          value={(options.cpuKind as string) ?? ""}
          onValueChange={(v) => onChange("cpuKind", v || undefined)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shared">Shared</SelectItem>
            <SelectItem value="performance">Performance</SelectItem>
            <SelectItem value="dedicated">Dedicated</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Organization</Label>
        <Input
          className="mt-1"
          placeholder="personal"
          value={(options.org as string) ?? ""}
          onChange={(e) => onChange("org", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">SSH Port</Label>
        <Input
          className="mt-1"
          type="number"
          placeholder="22"
          value={(options.sshPort as number) ?? ""}
          onChange={(e) => onChange("sshPort", e.target.value ? Number(e.target.value) : undefined)}
        />
      </div>
      <div className="space-y-3 pt-5">
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.autoStop as boolean) ?? false}
            onCheckedChange={(v) => onChange("autoStop", v)}
          />
          <Label className="text-xs">Auto Stop</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.autoStart as boolean) ?? false}
            onCheckedChange={(v) => onChange("autoStart", v)}
          />
          <Label className="text-xs">Auto Start</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.ha as boolean) ?? false}
            onCheckedChange={(v) => onChange("ha", v)}
          />
          <Label className="text-xs">High Availability</Label>
        </div>
      </div>
    </div>
  );
}
