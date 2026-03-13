import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GeoPin } from "@/types/fleet";
import { MapContainer, TileLayer } from "react-leaflet";
import { MapPins } from "./map/MapPins";
import { MapLegend } from "./map/MapLegend";
import "leaflet/dist/leaflet.css";

interface InstanceMapProps {
  pins: GeoPin[];
  loading?: boolean;
}

export function InstanceMap({ pins, loading }: InstanceMapProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Instance Locations</CardTitle>
        <MapLegend />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-48 bg-muted animate-pulse rounded-md" />
        ) : (
          <div className="relative w-full overflow-hidden rounded-md" style={{ height: 320 }}>
            <MapContainer
              center={[20, 0]}
              zoom={2}
              minZoom={2}
              maxZoom={14}
              scrollWheelZoom={true}
              zoomControl={true}
              attributionControl={false}
              className="h-full w-full rounded-md"
              style={{ background: "#0c1021" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <MapPins pins={pins} />
            </MapContainer>

            <div className="absolute bottom-1 right-1 z-[1000] pointer-events-none">
              <span
                title="Map tiles © CARTO"
                className="pointer-events-auto cursor-help inline-flex items-center justify-center w-4 h-4 rounded-full bg-background/60 text-[9px] text-muted-foreground hover:bg-background/90 transition-colors"
              >
                i
              </span>
            </div>

            {pins.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none z-[1000]">
                No geo-located instances
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
