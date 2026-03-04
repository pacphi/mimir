/**
 * Multi-fallback geo resolution service.
 *
 * Resolution chain:
 * 1. Region registry lookup (region-coords.ts)
 * 2. Agent-provided geo field (from RegistrationPayload.geo)
 * 3. User-provided tags (tags.geo_lat, tags.geo_lon)
 * 4. IP geolocation (for docker/kubernetes only)
 */

import { resolveRegionCoords } from "./region-coords.js";
import { geolocateIp } from "./ip-geolocation.js";
import { logger } from "../../lib/logger.js";

export interface GeoResolution {
  lat: number;
  lon: number;
  label: string;
  source: "region_registry" | "cloud_metadata" | "ip_geolocation" | "user_tags";
}

export interface GeoResolverInput {
  provider: string;
  region?: string | null;
  tags?: Record<string, string> | null;
  geo?: {
    lat?: number;
    lon?: number;
    city?: string;
    source?: string;
  } | null;
  remoteIp?: string | null;
}

/**
 * Resolve geographic coordinates for an instance using a multi-fallback chain.
 */
export async function resolveInstanceGeo(input: GeoResolverInput): Promise<GeoResolution | null> {
  // 1. Region registry lookup
  const regionCoord = resolveRegionCoords(input.region, input.provider);
  if (regionCoord) {
    return {
      lat: regionCoord.lat,
      lon: regionCoord.lon,
      label: regionCoord.label,
      source: "region_registry",
    };
  }

  // 2. Agent-provided geo field
  if (input.geo?.lat != null && input.geo?.lon != null) {
    return {
      lat: input.geo.lat,
      lon: input.geo.lon,
      label: input.geo.city ?? `${input.geo.lat.toFixed(2)}, ${input.geo.lon.toFixed(2)}`,
      source: "cloud_metadata",
    };
  }

  // 3. User-provided tags
  if (input.tags?.geo_lat && input.tags?.geo_lon) {
    const lat = parseFloat(input.tags.geo_lat);
    const lon = parseFloat(input.tags.geo_lon);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      return {
        lat,
        lon,
        label: input.tags.geo_label ?? `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        source: "user_tags",
      };
    }
  }

  // 4. IP geolocation (for docker/kubernetes instances without region data)
  if (input.remoteIp && ["docker", "kubernetes"].includes(input.provider.toLowerCase())) {
    try {
      const ipGeo = await geolocateIp(input.remoteIp);
      if (ipGeo) {
        const label =
          [ipGeo.city, ipGeo.country].filter(Boolean).join(", ") ||
          `${ipGeo.lat.toFixed(2)}, ${ipGeo.lon.toFixed(2)}`;
        return {
          lat: ipGeo.lat,
          lon: ipGeo.lon,
          label,
          source: "ip_geolocation",
        };
      }
    } catch (err) {
      logger.warn({ err, ip: input.remoteIp }, "IP geolocation failed");
    }
  }

  return null;
}
