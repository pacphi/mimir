import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    </div>
  );
}
