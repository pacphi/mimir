# ADR 0008: Interactive Fleet Map and Geo Resolution

**Date:** 2026-03-03
**Status:** Accepted

---

## Context

The Dashboard's "Instance Locations" section used a hand-drawn SVG world map (`WORLD_LAND_PATH`) with a basic equirectangular projection. It lacked zoom, pan, clustering, and click interactions. The `REGION_COORDS` in `fleet.ts` only covered ~30 regions, missing DigitalOcean, GCP, Azure, RunPod, and Northflank regions entirely. Docker and Kubernetes instances received hardcoded "local"/"default" coordinates with no actual geo-detection.

### Problems

- No interactive map controls (zoom, pan, click)
- Missing region coverage for 6 out of 11 supported providers
- No clustering — overlapping pins at scale
- No geo-detection for containerized (Docker/Kubernetes) workloads
- Geo resolution happened at query time with no persistence

## Decision

### 1. Interactive Leaflet Map

Replace the static SVG map with **Leaflet + react-leaflet** using dark CartoDB tiles. This provides:

- Zoom, pan, scroll wheel interaction
- Native popup support for instance details
- Mobile-friendly touch gestures

### 2. Supercluster Clustering

Use **supercluster** (via `use-supercluster`) for viewport-aware clustering:

- Cluster markers display instance count and aggregate status
- Clicking a cluster zooms to its bounding box
- Individual pins show region, provider, and status breakdown in popups

### 3. Comprehensive Region Registry

A centralized `region-coords.ts` registry with ~120 entries covering all 11 providers:

- Fly.io (30 regions)
- AWS/E2B (19 regions)
- GCP (25 regions)
- Azure (29 regions)
- DigitalOcean (11 regions via aliases)
- RunPod (3 regions)
- Northflank (delegates to AWS/GCP names)
- Generic fallbacks (5)

Provider-specific alias resolution handles different naming conventions (e.g., DigitalOcean `syd1` → Sydney).

### 4. Multi-Fallback Geo Resolution

A `resolveInstanceGeo()` function with a 4-step fallback chain:

1. **Region registry** — known cloud region → coordinates
2. **Agent-provided geo** — `RegistrationPayload.geo` field (future cloud metadata detection)
3. **User tags** — `tags.geo_lat` / `tags.geo_lon`
4. **IP geolocation** — MaxMind GeoLite2 (primary) + ip-api.com (fallback), for Docker/Kubernetes only

Results are **persisted** as denormalized columns on the Instance model (`geo_lat`, `geo_lon`, `geo_label`, `geo_source`), avoiding re-resolution at query time.

### 5. Real-time Updates

- Instance registration publishes `geo_update` via Redis pub/sub
- Fleet WebSocket handler pushes updates to connected browsers
- Fleet geo endpoint caches in Redis (10s TTL), invalidated on registration

## Alternatives Considered

| Alternative                     | Reason Not Chosen                                     |
| ------------------------------- | ----------------------------------------------------- |
| **MapLibre GL**                 | Requires hosting a tile server; heavier bundle        |
| **Deck.GL**                     | Overkill for our instance count (~100s, not millions) |
| **On-the-fly resolution**       | Can't persist IP geolocation results; slower queries  |
| **Single geolocation provider** | Less resilient; MaxMind requires license key          |
| **Keep SVG map**                | Lacks interactivity; can't scale to many regions      |

## Consequences

### Positive

- Interactive map with zoom/pan/click for exploring fleet distribution
- Comprehensive provider coverage (all 11 providers, ~120 regions)
- Geo-detection for Docker/Kubernetes via IP geolocation
- Real-time pin updates via WebSocket
- Cached queries for performance

### Negative

- New frontend dependencies (~40KB Leaflet + ~5KB supercluster gzipped)
- Optional `@maxmind/geoip2-node` dependency for MaxMind
- Prisma migration adding 4 new columns to Instance model
- ~120-entry region registry requires maintenance as providers add regions
- External API dependency (ip-api.com) for Docker/K8s geo-detection

### Migration

- Backfill script resolves coordinates for existing instances
- New protocol `geo` field is backward-compatible (optional)
- Existing agents without `geo` continue working via region registry fallback
