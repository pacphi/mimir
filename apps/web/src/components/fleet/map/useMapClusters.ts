/**
 * Hook that feeds GeoPin[] through supercluster for viewport-aware clustering.
 */

import { useMemo } from "react";
import useSupercluster from "use-supercluster";
import type { GeoPin } from "@/types/fleet";
import { pinsToGeoJSON } from "./map-utils";
import type { BBox } from "geojson";

interface UseMapClustersInput {
  pins: GeoPin[];
  bounds: BBox | null;
  zoom: number;
}

export function useMapClusters({ pins, bounds, zoom }: UseMapClustersInput) {
  const points = useMemo(() => pinsToGeoJSON(pins), [pins]);

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds: bounds ?? undefined,
    zoom,
    options: {
      radius: 60,
      maxZoom: 12,
    },
  });

  return { clusters, supercluster };
}
