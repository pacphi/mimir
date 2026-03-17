/**
 * Map utility functions — GeoJSON conversion, color helpers, status calculations.
 */

import type { GeoPin } from "@/types/fleet";
import type { Feature, Point } from "geojson";

export interface GeoPinProperties {
  cluster: false;
  pinIndex: number;
  region: string;
  label: string;
  count: number;
  statuses: Record<string, number>;
  provider: string;
  distro?: string;
}

/**
 * Convert GeoPin array to GeoJSON FeatureCollection for supercluster.
 */
export function pinsToGeoJSON(pins: GeoPin[]): Feature<Point, GeoPinProperties>[] {
  return pins.map((pin, index) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [pin.lon, pin.lat],
    },
    properties: {
      cluster: false as const,
      pinIndex: index,
      region: pin.region,
      label: pin.label,
      count: pin.count,
      statuses: pin.statuses,
      provider: pin.provider,
      distro: pin.distro,
    },
  }));
}

/**
 * Get status color based on instance statuses.
 */
export function getStatusColor(statuses: Record<string, number>, count: number): string {
  const running = statuses["RUNNING"] ?? 0;
  const hasError = (statuses["ERROR"] ?? 0) > 0;

  if (hasError) return "#ef4444";
  if (running === count) return "#10b981";
  return "#f59e0b";
}

/**
 * Calculate cluster size based on point count.
 */
export function getClusterSize(pointCount: number): number {
  return Math.min(40, 24 + Math.log2(pointCount) * 6);
}
