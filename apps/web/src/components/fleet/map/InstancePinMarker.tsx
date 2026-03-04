/**
 * Single instance pin marker with a popup showing region, provider, and status breakdown.
 */

import { CircleMarker, Popup } from "react-leaflet";
import { getStatusColor } from "./map-utils";

interface InstancePinMarkerProps {
  lat: number;
  lon: number;
  label: string;
  region: string;
  provider: string;
  count: number;
  statuses: Record<string, number>;
}

const STATUS_LABELS: Record<string, string> = {
  RUNNING: "Running",
  STOPPED: "Stopped",
  DEPLOYING: "Deploying",
  DESTROYING: "Destroying",
  SUSPENDED: "Suspended",
  ERROR: "Error",
  UNKNOWN: "Unknown",
};

export function InstancePinMarker({
  lat,
  lon,
  label,
  region,
  provider,
  count,
  statuses,
}: InstancePinMarkerProps) {
  const color = getStatusColor(statuses, count);
  const radius = Math.min(4 + count * 1.5, 12);

  return (
    <CircleMarker
      center={[lat, lon]}
      radius={radius}
      pathOptions={{
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2,
        opacity: 0.4,
      }}
    >
      <Popup>
        <div className="text-sm">
          <div className="font-semibold text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {region} &middot; {provider}
          </div>
          <div className="mt-1.5 space-y-0.5">
            {Object.entries(statuses).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between gap-3 text-xs">
                <span>{STATUS_LABELS[status] ?? status}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 pt-1 border-t text-xs text-muted-foreground">
            {count} instance{count !== 1 ? "s" : ""} total
          </div>
        </div>
      </Popup>
    </CircleMarker>
  );
}
