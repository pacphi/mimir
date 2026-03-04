/**
 * Cluster marker rendered as a DivIcon with an SVG donut chart
 * showing the status ratio of instances in the cluster.
 */

import { Marker } from "react-leaflet";
import L from "leaflet";
import { getClusterSize } from "./map-utils";

interface ClusterMarkerProps {
  lat: number;
  lon: number;
  pointCount: number;
  totalCount: number;
  onExpand: () => void;
}

function createDonutIcon(pointCount: number): L.DivIcon {
  const size = getClusterSize(pointCount);
  const half = size / 2;
  const r = half - 3;
  const circumference = 2 * Math.PI * r;

  return L.divIcon({
    html: `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${half}" cy="${half}" r="${half}" fill="#10b981" fill-opacity="0.2" />
        <circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="#10b981" stroke-width="3"
          stroke-dasharray="${circumference}" stroke-dashoffset="0" />
        <text x="${half}" y="${half}" text-anchor="middle" dominant-baseline="central"
          fill="white" font-size="${size > 32 ? 12 : 10}" font-weight="600">
          ${pointCount}
        </text>
      </svg>
    `,
    className: "leaflet-cluster-marker",
    iconSize: L.point(size, size),
    iconAnchor: L.point(size / 2, size / 2),
  });
}

export function ClusterMarker({ lat, lon, pointCount, onExpand }: ClusterMarkerProps) {
  return (
    <Marker
      position={[lat, lon]}
      icon={createDonutIcon(pointCount)}
      eventHandlers={{
        click: onExpand,
      }}
    />
  );
}
