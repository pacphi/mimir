/**
 * Renders clusters and individual pins using supercluster within the Leaflet map.
 */

import { useMap, useMapEvents } from "react-leaflet";
import { useState, useCallback } from "react";
import type { GeoPin } from "@/types/fleet";
import { useMapClusters } from "./useMapClusters";
import { ClusterMarker } from "./ClusterMarker";
import { InstancePinMarker } from "./InstancePinMarker";
import type { BBox } from "geojson";

interface MapPinsProps {
  pins: GeoPin[];
}

export function MapPins({ pins }: MapPinsProps) {
  const map = useMap();
  const [bounds, setBounds] = useState<BBox | null>(getBounds(map));
  const [zoom, setZoom] = useState(map.getZoom());

  const updateBoundsAndZoom = useCallback(() => {
    setBounds(getBounds(map));
    setZoom(map.getZoom());
  }, [map]);

  useMapEvents({
    moveend: updateBoundsAndZoom,
    zoomend: updateBoundsAndZoom,
  });

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
                if (!supercluster) return;
                const expansionZoom = Math.min(supercluster.getClusterExpansionZoom(clusterId), 14);
                map.flyTo([lat, lon], expansionZoom);
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

function getBounds(map: L.Map): BBox {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}
