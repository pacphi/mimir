/**
 * Cluster marker rendered as a custom SVG donut chart
 * showing the count of instances in the cluster.
 */

import { Marker } from "react-map-gl/maplibre";
import { getClusterSize } from "./map-utils";

interface ClusterMarkerProps {
  lat: number;
  lon: number;
  pointCount: number;
  totalCount: number;
  onExpand: () => void;
}

export function ClusterMarker({ lat, lon, pointCount, onExpand }: ClusterMarkerProps) {
  const size = getClusterSize(pointCount);
  const half = size / 2;
  const r = half - 3;
  const circumference = 2 * Math.PI * r;

  return (
    <Marker longitude={lon} latitude={lat} anchor="center" onClick={onExpand}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ cursor: "pointer" }}>
        <circle cx={half} cy={half} r={half} fill="#10b981" fillOpacity={0.2} />
        <circle
          cx={half}
          cy={half}
          r={r}
          fill="none"
          stroke="#10b981"
          strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={0}
        />
        <text
          x={half}
          y={half}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={size > 32 ? 12 : 10}
          fontWeight={600}
        >
          {pointCount}
        </text>
      </svg>
    </Marker>
  );
}
