/**
 * Renders clusters and individual pins using supercluster within the MapLibre map.
 */

import { useMap } from "react-map-gl/maplibre";
import { useState, useCallback, useEffect } from "react";
import type { GeoPin } from "@/types/fleet";
import { useMapClusters } from "./useMapClusters";
import { ClusterMarker } from "./ClusterMarker";
import { InstancePinMarker } from "./InstancePinMarker";
import type { BBox } from "geojson";

interface MapPinsProps {
  pins: GeoPin[];
}

export function MapPins({ pins }: MapPinsProps) {
  const { current: mapRef } = useMap();
  const [bounds, setBounds] = useState<BBox | null>(null);
  const [zoom, setZoom] = useState(2);

  const updateBoundsAndZoom = useCallback(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();
    const b = map.getBounds();
    setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    setZoom(Math.floor(map.getZoom()));
  }, [mapRef]);

  // Set initial bounds once map is loaded
  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();

    if (map.loaded()) {
      updateBoundsAndZoom();
    } else {
      map.on("load", updateBoundsAndZoom);
    }
    map.on("moveend", updateBoundsAndZoom);

    return () => {
      map.off("load", updateBoundsAndZoom);
      map.off("moveend", updateBoundsAndZoom);
    };
  }, [mapRef, updateBoundsAndZoom]);

  const { clusters, supercluster } = useMapClusters({ pins, bounds, zoom });

  return (
    <>
      {clusters.map((cluster) => {
        const [lon, lat] = cluster.geometry.coordinates;
        const properties = cluster.properties;

        if (properties.cluster) {
          const clusterId = properties.cluster_id as number;
          return (
            <ClusterMarker
              key={`cluster-${clusterId}`}
              lat={lat}
              lon={lon}
              pointCount={properties.point_count as number}
              totalCount={properties.point_count as number}
              onExpand={() => {
                if (!supercluster || !mapRef) return;
                const expansionZoom = Math.min(supercluster.getClusterExpansionZoom(clusterId), 14);
                mapRef.flyTo({ center: [lon, lat], zoom: expansionZoom });
              }}
            />
          );
        }

        return (
          <InstancePinMarker
            key={`pin-${properties.pinIndex}`}
            lat={lat}
            lon={lon}
            label={properties.label}
            region={properties.region}
            provider={properties.provider}
            count={properties.count}
            statuses={properties.statuses}
          />
        );
      })}
    </>
  );
}
