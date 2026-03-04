/**
 * IP geolocation service with MaxMind GeoLite2 (primary) and ip-api.com (fallback).
 *
 * Results are cached in Redis for 24 hours to minimize external API calls.
 */

import { redis } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";

export interface GeoResult {
  lat: number;
  lon: number;
  city?: string;
  country?: string;
}

const CACHE_PREFIX = "sindri:geo:ip:";
const CACHE_TTL = 86400; // 24 hours

// ─────────────────────────────────────────────────────────────────────────────
// MaxMind GeoLite2 (optional — requires MAXMIND_LICENSE_KEY env var)
// ─────────────────────────────────────────────────────────────────────────────

let maxmindReader: {
  city: (ip: string) => {
    city?: { names?: { en?: string } };
    country?: { names?: { en?: string } };
    location?: { latitude?: number; longitude?: number };
  };
} | null = null;

async function getMaxMindReader(): Promise<typeof maxmindReader> {
  if (maxmindReader !== undefined && maxmindReader !== null) return maxmindReader;
  if (!process.env.MAXMIND_LICENSE_KEY) return null;

  try {
    // Dynamic import — @maxmind/geoip2-node is an optional dependency
    const { Reader: _Reader } = await import("@maxmind/geoip2-node");
    const response = await fetch(
      `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${process.env.MAXMIND_LICENSE_KEY}&suffix=tar.gz`,
    );
    if (!response.ok) {
      logger.warn("MaxMind download failed, disabling MaxMind geolocation");
      return null;
    }
    // For simplicity, use the web service client instead of local DB
    const { WebServiceClient } = await import("@maxmind/geoip2-node");
    const client = new WebServiceClient(
      process.env.MAXMIND_ACCOUNT_ID ?? "0",
      process.env.MAXMIND_LICENSE_KEY,
      { host: "geolite.info" },
    );
    maxmindReader = client as unknown as typeof maxmindReader;
    logger.info("MaxMind GeoLite2 web client initialized");
    return maxmindReader;
  } catch {
    logger.warn("MaxMind GeoLite2 not available, will use ip-api.com fallback");
    return null;
  }
}

async function lookupMaxMind(ip: string): Promise<GeoResult | null> {
  const reader = await getMaxMindReader();
  if (!reader) return null;

  try {
    const result = reader.city(ip);
    if (result.location?.latitude != null && result.location?.longitude != null) {
      return {
        lat: result.location.latitude,
        lon: result.location.longitude,
        city: result.city?.names?.en,
        country: result.country?.names?.en,
      };
    }
  } catch {
    // IP not found in MaxMind DB
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ip-api.com free API (fallback — 45 req/min, no key required)
// ─────────────────────────────────────────────────────────────────────────────

async function lookupIpApi(ip: string): Promise<GeoResult | null> {
  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,lat,lon,city,country`,
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      status: string;
      lat?: number;
      lon?: number;
      city?: string;
      country?: string;
    };

    if (data.status === "success" && data.lat != null && data.lon != null) {
      return {
        lat: data.lat,
        lon: data.lon,
        city: data.city,
        country: data.country,
      };
    }
  } catch (err) {
    logger.warn({ err, ip }, "ip-api.com lookup failed");
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up geographic coordinates for an IP address.
 * Checks Redis cache first, then tries MaxMind, then ip-api.com.
 */
export async function geolocateIp(ip: string): Promise<GeoResult | null> {
  // Skip private/localhost IPs
  if (isPrivateIp(ip)) return null;

  // Check cache
  const cacheKey = CACHE_PREFIX + ip;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as GeoResult;
    }
  } catch {
    // Cache miss, continue
  }

  // Try MaxMind first
  let result = await lookupMaxMind(ip);

  // Fallback to ip-api.com
  if (!result) {
    result = await lookupIpApi(ip);
  }

  // Cache result
  if (result) {
    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
    } catch {
      // Non-critical, ignore cache write failures
    }
  }

  return result;
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.3") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  );
}
