import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeploymentWizardStore } from "@/stores/deploymentWizardStore";
import {
  SYSTEM_MOUNT_PATH,
  HOME_DATA_MIN_SIZE_GB,
  VOLUME_MIN_SIZE_GB,
} from "@/lib/sindri-constraints";
import { useAppConfig } from "@/hooks/useAppConfig";

export function Step2ImageVolumes() {
  const {
    imageConfig,
    setImageConfig,
    homeDataSizeGb,
    setHomeDataSizeGb,
    volumes,
    addVolume,
    removeVolume,
    updateVolume,
  } = useDeploymentWizardStore();
  const { data: appConfig } = useAppConfig();

  return (
    <div className="space-y-6">
      {/* Image Configuration */}
      <div>
        <h3 className="text-sm font-medium mb-3">Image Configuration</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Leave blank to use the default image ({appConfig?.sindriDefaultImage ?? "sindri:latest"}).
          Set a registry and version to pull a specific image from a container registry.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="img-registry" className="text-xs">
              Registry
            </Label>
            <Input
              id="img-registry"
              className="mt-1"
              placeholder={appConfig?.sindriImageRegistry ?? "ghcr.io/pacphi/sindri"}
              value={imageConfig.registry ?? ""}
              onChange={(e) => setImageConfig({ registry: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label htmlFor="img-version" className="text-xs">
              Version / Tag
            </Label>
            <Input
              id="img-version"
              className="mt-1"
              placeholder="latest"
              value={imageConfig.version ?? ""}
              onChange={(e) => setImageConfig({ version: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label htmlFor="img-tag-override" className="text-xs">
              Tag Override
            </Label>
            <Input
              id="img-tag-override"
              className="mt-1"
              placeholder="Optional"
              value={imageConfig.tagOverride ?? ""}
              onChange={(e) => setImageConfig({ tagOverride: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label htmlFor="img-digest" className="text-xs">
              Digest (SHA256)
            </Label>
            <Input
              id="img-digest"
              className="mt-1 font-mono text-xs"
              placeholder="sha256:abc123..."
              value={imageConfig.digest ?? ""}
              onChange={(e) => setImageConfig({ digest: e.target.value || undefined })}
            />
          </div>
        </div>

        <div className="flex items-center gap-6 mt-4">
          <div>
            <Label htmlFor="img-pull-policy" className="text-xs">
              Pull Policy
            </Label>
            <Select
              value={imageConfig.pullPolicy ?? ""}
              onValueChange={(v) =>
                setImageConfig({
                  pullPolicy: (v || undefined) as typeof imageConfig.pullPolicy,
                })
              }
            >
              <SelectTrigger id="img-pull-policy" className="w-[180px] mt-1">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Always</SelectItem>
                <SelectItem value="if-not-present">If Not Present</SelectItem>
                <SelectItem value="never">Never</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-4">
            <Switch
              id="img-verify-sig"
              checked={imageConfig.verifySignature ?? false}
              onCheckedChange={(v) => setImageConfig({ verifySignature: v })}
            />
            <Label htmlFor="img-verify-sig" className="text-xs">
              Verify Signature
            </Label>
          </div>
          <div className="flex items-center gap-2 pt-4">
            <Switch
              id="img-verify-prov"
              checked={imageConfig.verifyProvenance ?? false}
              onCheckedChange={(v) => setImageConfig({ verifyProvenance: v })}
            />
            <Label htmlFor="img-verify-prov" className="text-xs">
              Verify Provenance
            </Label>
          </div>
        </div>
      </div>

      {/* Volumes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium">Persistent Volumes</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add <em>additional</em> volumes beyond the system-managed home volume.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={addVolume}>
            Add Volume
          </Button>
        </div>

        {/* System volume — name/path read-only, size editable */}
        <div className="flex items-end gap-3 p-3 rounded-md border border-input bg-muted/40 mb-3">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <div className="mt-1 flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-muted/60 font-mono text-xs text-muted-foreground select-none">
              home_data
            </div>
          </div>
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Mount Path</Label>
            <div className="mt-1 flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-muted/60 font-mono text-xs text-muted-foreground select-none">
              {SYSTEM_MOUNT_PATH}
            </div>
          </div>
          <div className="w-32">
            <Label htmlFor="home-data-size" className="text-xs text-muted-foreground">
              Size (GB)
            </Label>
            <div className="mt-1 flex items-center">
              <Input
                id="home-data-size"
                type="number"
                min={HOME_DATA_MIN_SIZE_GB}
                step={1}
                className="rounded-r-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={homeDataSizeGb || ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setHomeDataSizeGb(0);
                  } else {
                    const v = parseInt(raw, 10);
                    if (!isNaN(v)) setHomeDataSizeGb(v);
                  }
                }}
                onBlur={() => {
                  if (homeDataSizeGb < HOME_DATA_MIN_SIZE_GB)
                    setHomeDataSizeGb(HOME_DATA_MIN_SIZE_GB);
                }}
              />
              <span className="inline-flex items-center h-9 px-2 rounded-r-md border border-l-0 border-input bg-muted text-xs text-muted-foreground select-none">
                GB
              </span>
            </div>
          </div>
          <div className="h-9 w-9 shrink-0 flex items-center justify-center text-muted-foreground/50">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-label="System-managed"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          System-managed — always provisioned. Minimum {HOME_DATA_MIN_SIZE_GB}GB.
        </p>

        {volumes.length > 0 && (
          <div className="space-y-3">
            {volumes.map((vol, i) => (
              <div
                key={i}
                className="flex items-end gap-3 p-3 rounded-md border border-input bg-background"
              >
                <div className="flex-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    className="mt-1"
                    placeholder="data"
                    value={vol.name}
                    onChange={(e) => updateVolume(i, { name: e.target.value })}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Mount Path</Label>
                  <Input
                    className="mt-1 font-mono text-xs"
                    placeholder="/data"
                    value={vol.path}
                    onChange={(e) => updateVolume(i, { path: e.target.value })}
                  />
                </div>
                <div className="w-32">
                  <Label className="text-xs">Size (GB)</Label>
                  <div className="mt-1 flex items-center">
                    <Input
                      type="number"
                      min={VOLUME_MIN_SIZE_GB}
                      step={1}
                      className="rounded-r-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder={String(VOLUME_MIN_SIZE_GB)}
                      value={vol.size ? parseInt(vol.size, 10) || "" : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateVolume(i, { size: v ? `${v}GB` : "" });
                      }}
                      onBlur={() => {
                        const num = parseInt(vol.size, 10);
                        if (!isNaN(num) && num < VOLUME_MIN_SIZE_GB) {
                          updateVolume(i, { size: `${VOLUME_MIN_SIZE_GB}GB` });
                        }
                      }}
                    />
                    <span className="inline-flex items-center h-9 px-2 rounded-r-md border border-l-0 border-input bg-muted text-xs text-muted-foreground select-none">
                      GB
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeVolume(i)}
                  aria-label="Remove volume"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </Button>
              </div>
            ))}
          </div>
        )}

        {volumes.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No additional volumes configured. The system volume at{" "}
              <code className="font-mono text-xs">{SYSTEM_MOUNT_PATH}</code> is always provisioned
              automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
