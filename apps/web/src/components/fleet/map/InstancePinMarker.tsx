/**
 * Single instance pin marker with a popup showing region, provider, and status breakdown.
 */

import { Marker, Popup } from "react-map-gl/maplibre";
import { useState } from "react";
import { getStatusColor } from "./map-utils";

interface InstancePinMarkerProps {
  lat: number;
  lon: number;
  label: string;
  region: string;
  provider: string;
  distro?: string;
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
  distro,
  count,
  statuses,
}: InstancePinMarkerProps) {
  const [showPopup, setShowPopup] = useState(false);
  const color = getStatusColor(statuses, count);
  const size = Math.min(8 + count * 3, 24);

  return (
    <>
      <Marker longitude={lon} latitude={lat} anchor="center" onClick={() => setShowPopup(true)}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ cursor: "pointer" }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2}
            fill={color}
            fillOpacity={0.85}
            stroke={color}
            strokeOpacity={0.4}
            strokeWidth={2}
          />
        </svg>
      </Marker>
      {showPopup && (
        <Popup
          longitude={lon}
          latitude={lat}
          anchor="bottom"
          onClose={() => setShowPopup(false)}
          closeOnClick={false}
          className="[&_.maplibregl-popup-content]:bg-popover [&_.maplibregl-popup-content]:text-popover-foreground [&_.maplibregl-popup-content]:border [&_.maplibregl-popup-content]:border-border [&_.maplibregl-popup-content]:shadow-md [&_.maplibregl-popup-tip]:border-t-popover"
        >
          <div className="text-sm">
            <div className="font-semibold text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {region} &middot; {provider}
              {distro ? ` \u00b7 ${distro}` : ""}
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
      )}
    </>
  );
}
