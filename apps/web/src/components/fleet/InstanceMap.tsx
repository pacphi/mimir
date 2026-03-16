import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GeoPin } from "@/types/fleet";
import { Map, NavigationControl } from "react-map-gl/maplibre";
import { MapPins } from "./map/MapPins";
import { MapLegend } from "./map/MapLegend";
import "maplibre-gl/dist/maplibre-gl.css";

interface InstanceMapProps {
  pins: GeoPin[];
  loading?: boolean;
}

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export function InstanceMap({ pins, loading }: InstanceMapProps) {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Instance Locations</CardTitle>
        <MapLegend />
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full min-h-48 bg-muted animate-pulse rounded-md" />
        ) : (
          <div className="relative w-full overflow-hidden rounded-md h-full min-h-[400px]">
            <Map
              initialViewState={{
                longitude: 0,
                latitude: 20,
                zoom: 1.5,
              }}
              minZoom={1}
              maxZoom={14}
              renderWorldCopies={false}
              mapStyle={DARK_STYLE}
              style={{ width: "100%", height: "100%", borderRadius: "0.375rem" }}
            >
              <NavigationControl position="top-left" />
              <MapPins pins={pins} />
            </Map>

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
