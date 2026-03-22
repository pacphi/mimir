import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ProviderOptionsProps } from ".";

export function KubernetesOptions({ options, onChange }: ProviderOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs">Namespace</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="default"
          value={(options.namespace as string) ?? ""}
          onChange={(e) => onChange("namespace", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Storage Class</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="standard"
          value={(options.storageClass as string) ?? ""}
          onChange={(e) => onChange("storageClass", e.target.value || undefined)}
        />
      </div>
      <div>
        <Label className="text-xs">Kubeconfig Context</Label>
        <Input
          className="mt-1 font-mono text-xs"
          placeholder="my-cluster"
          value={(options.context as string) ?? ""}
          onChange={(e) => onChange("context", e.target.value || undefined)}
        />
      </div>
      <div className="space-y-3 pt-5">
        <div className="flex items-center gap-2">
          <Switch
            checked={(options.ingress as { enabled?: boolean })?.enabled ?? false}
            onCheckedChange={(v) =>
              onChange("ingress", {
                ...((options.ingress as Record<string, unknown>) ?? {}),
                enabled: v,
              })
            }
          />
          <Label className="text-xs">Enable Ingress</Label>
        </div>
        {(options.ingress as { enabled?: boolean })?.enabled && (
          <div>
            <Label className="text-xs">Ingress Hostname</Label>
            <Input
              className="mt-1 font-mono text-xs"
              placeholder="dev.example.com"
              value={(options.ingress as { hostname?: string })?.hostname ?? ""}
              onChange={(e) =>
                onChange("ingress", {
                  ...((options.ingress as Record<string, unknown>) ?? {}),
                  hostname: e.target.value || undefined,
                })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
