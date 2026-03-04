/**
 * Comprehensive region coordinate registry covering all supported cloud providers.
 *
 * Each entry maps a region identifier to its approximate geographic coordinates
 * and a human-readable label.
 */

export interface RegionCoord {
  lat: number;
  lon: number;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider-specific region aliases
// Some providers use short codes that differ from the canonical region name.
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_ALIASES: Record<string, Record<string, string>> = {
  digitalocean: {
    nyc1: "do-nyc",
    nyc2: "do-nyc",
    nyc3: "do-nyc",
    sfo1: "do-sfo",
    sfo2: "do-sfo",
    sfo3: "do-sfo",
    ams2: "do-ams",
    ams3: "do-ams",
    fra1: "fra",
    lon1: "lhr",
    sgp1: "sin",
    tor1: "do-tor",
    blr1: "do-blr",
    syd1: "syd",
  },
  runpod: {
    "us-tx-3": "dfw",
    "eu-ro-1": "runpod-eu-ro",
    "ca-mtl-1": "runpod-ca-mtl",
  },
  northflank: {
    "us-east-1": "us-east-1",
    "us-west-2": "us-west-2",
    "eu-west-1": "eu-west-1",
    "eu-west-2": "eu-west-2",
    "ap-southeast-1": "ap-southeast-1",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Master coordinate registry
// ─────────────────────────────────────────────────────────────────────────────

const REGION_COORDS: Record<string, RegionCoord> = {
  // ── Fly.io ──────────────────────────────────────────────────────────────
  iad: { lat: 38.94, lon: -77.46, label: "Ashburn, VA" },
  lax: { lat: 33.94, lon: -118.41, label: "Los Angeles" },
  ord: { lat: 41.97, lon: -87.91, label: "Chicago" },
  lhr: { lat: 51.47, lon: -0.45, label: "London" },
  fra: { lat: 50.11, lon: 8.68, label: "Frankfurt" },
  nrt: { lat: 35.77, lon: 140.39, label: "Tokyo" },
  syd: { lat: -33.94, lon: 151.18, label: "Sydney" },
  sea: { lat: 47.45, lon: -122.3, label: "Seattle" },
  dfw: { lat: 32.9, lon: -97.04, label: "Dallas" },
  sin: { lat: 1.36, lon: 103.99, label: "Singapore" },
  bom: { lat: 19.09, lon: 72.87, label: "Mumbai" },
  gru: { lat: -23.43, lon: -46.47, label: "São Paulo" },
  ams: { lat: 52.37, lon: 4.89, label: "Amsterdam" },
  arn: { lat: 59.65, lon: 17.94, label: "Stockholm" },
  cdg: { lat: 49.01, lon: 2.55, label: "Paris" },
  ewr: { lat: 40.69, lon: -74.17, label: "Newark, NJ" },
  jnb: { lat: -26.13, lon: 28.24, label: "Johannesburg" },
  sjc: { lat: 37.36, lon: -121.93, label: "San Jose" },
  yyz: { lat: 43.68, lon: -79.63, label: "Toronto" },
  mia: { lat: 25.79, lon: -80.29, label: "Miami" },
  atl: { lat: 33.64, lon: -84.43, label: "Atlanta" },
  den: { lat: 39.86, lon: -104.67, label: "Denver" },
  hkg: { lat: 22.31, lon: 113.91, label: "Hong Kong" },
  scl: { lat: -33.39, lon: -70.79, label: "Santiago" },
  bog: { lat: 4.7, lon: -74.15, label: "Bogotá" },
  eze: { lat: -34.82, lon: -58.54, label: "Buenos Aires" },
  gdl: { lat: 20.52, lon: -103.31, label: "Guadalajara" },
  qro: { lat: 20.62, lon: -100.19, label: "Querétaro" },
  waw: { lat: 52.17, lon: 20.97, label: "Warsaw" },
  mad: { lat: 40.49, lon: -3.57, label: "Madrid" },

  // ── AWS / E2B ───────────────────────────────────────────────────────────
  "us-east-1": { lat: 38.13, lon: -78.45, label: "US East (N. Virginia)" },
  "us-east-2": { lat: 39.96, lon: -83.0, label: "US East (Ohio)" },
  "us-west-1": { lat: 37.35, lon: -121.96, label: "US West (N. California)" },
  "us-west-2": { lat: 45.87, lon: -119.69, label: "US West (Oregon)" },
  "eu-west-1": { lat: 53.34, lon: -6.26, label: "EU West (Ireland)" },
  "eu-west-2": { lat: 51.51, lon: -0.13, label: "EU West (London)" },
  "eu-west-3": { lat: 48.86, lon: 2.35, label: "EU West (Paris)" },
  "eu-central-1": { lat: 50.11, lon: 8.68, label: "EU Central (Frankfurt)" },
  "eu-north-1": { lat: 59.33, lon: 18.07, label: "EU North (Stockholm)" },
  "ap-southeast-1": { lat: 1.36, lon: 103.99, label: "AP (Singapore)" },
  "ap-southeast-2": { lat: -33.87, lon: 151.21, label: "AP (Sydney)" },
  "ap-northeast-1": { lat: 35.68, lon: 139.69, label: "AP (Tokyo)" },
  "ap-northeast-2": { lat: 37.57, lon: 126.98, label: "AP (Seoul)" },
  "ap-northeast-3": { lat: 34.69, lon: 135.5, label: "AP (Osaka)" },
  "ap-south-1": { lat: 19.08, lon: 72.88, label: "AP (Mumbai)" },
  "sa-east-1": { lat: -23.55, lon: -46.63, label: "SA (São Paulo)" },
  "ca-central-1": { lat: 45.5, lon: -73.58, label: "Canada (Montreal)" },
  "me-south-1": { lat: 26.07, lon: 50.56, label: "Middle East (Bahrain)" },
  "af-south-1": { lat: -33.93, lon: 18.42, label: "Africa (Cape Town)" },

  // ── GCP ─────────────────────────────────────────────────────────────────
  "us-central1": { lat: 41.26, lon: -95.86, label: "GCP Iowa" },
  "us-east1": { lat: 33.84, lon: -81.16, label: "GCP South Carolina" },
  "us-east4": { lat: 38.94, lon: -77.46, label: "GCP N. Virginia" },
  "us-west1": { lat: 43.8, lon: -120.55, label: "GCP Oregon" },
  "us-west2": { lat: 34.05, lon: -118.24, label: "GCP Los Angeles" },
  "us-west4": { lat: 36.17, lon: -115.14, label: "GCP Las Vegas" },
  "europe-west1": { lat: 50.44, lon: 3.82, label: "GCP Belgium" },
  "europe-west2": { lat: 51.51, lon: -0.13, label: "GCP London" },
  "europe-west3": { lat: 50.11, lon: 8.68, label: "GCP Frankfurt" },
  "europe-west4": { lat: 53.44, lon: 6.84, label: "GCP Netherlands" },
  "europe-west6": { lat: 47.38, lon: 8.54, label: "GCP Zürich" },
  "europe-north1": { lat: 60.57, lon: 27.19, label: "GCP Finland" },
  "asia-east1": { lat: 24.07, lon: 120.54, label: "GCP Taiwan" },
  "asia-east2": { lat: 22.34, lon: 114.18, label: "GCP Hong Kong" },
  "asia-southeast1": { lat: 1.35, lon: 103.82, label: "GCP Singapore" },
  "asia-southeast2": { lat: -6.2, lon: 106.85, label: "GCP Jakarta" },
  "asia-northeast1": { lat: 35.68, lon: 139.69, label: "GCP Tokyo" },
  "asia-northeast2": { lat: 34.69, lon: 135.5, label: "GCP Osaka" },
  "asia-northeast3": { lat: 37.57, lon: 126.98, label: "GCP Seoul" },
  "asia-south1": { lat: 19.08, lon: 72.88, label: "GCP Mumbai" },
  "asia-south2": { lat: 28.61, lon: 77.21, label: "GCP Delhi" },
  "australia-southeast1": { lat: -33.87, lon: 151.21, label: "GCP Sydney" },
  "australia-southeast2": { lat: -37.81, lon: 144.96, label: "GCP Melbourne" },
  "southamerica-east1": { lat: -23.55, lon: -46.63, label: "GCP São Paulo" },
  "northamerica-northeast1": { lat: 45.5, lon: -73.58, label: "GCP Montreal" },

  // ── Azure ───────────────────────────────────────────────────────────────
  eastus: { lat: 37.37, lon: -79.46, label: "Azure East US" },
  eastus2: { lat: 36.67, lon: -78.93, label: "Azure East US 2" },
  westus: { lat: 37.78, lon: -122.42, label: "Azure West US" },
  westus2: { lat: 47.23, lon: -119.85, label: "Azure West US 2" },
  westus3: { lat: 33.45, lon: -112.07, label: "Azure West US 3" },
  centralus: { lat: 41.26, lon: -95.86, label: "Azure Central US" },
  northcentralus: { lat: 41.88, lon: -87.63, label: "Azure N. Central US" },
  southcentralus: { lat: 29.43, lon: -98.49, label: "Azure S. Central US" },
  westeurope: { lat: 52.37, lon: 4.89, label: "Azure West Europe" },
  northeurope: { lat: 53.35, lon: -6.26, label: "Azure North Europe" },
  uksouth: { lat: 51.51, lon: -0.13, label: "Azure UK South" },
  ukwest: { lat: 51.48, lon: -3.18, label: "Azure UK West" },
  germanywestcentral: { lat: 50.11, lon: 8.68, label: "Azure Germany West Central" },
  francecentral: { lat: 46.3, lon: 2.37, label: "Azure France Central" },
  switzerlandnorth: { lat: 47.45, lon: 8.56, label: "Azure Switzerland North" },
  norwayeast: { lat: 59.91, lon: 10.75, label: "Azure Norway East" },
  swedencentral: { lat: 60.67, lon: 17.14, label: "Azure Sweden Central" },
  southeastasia: { lat: 1.28, lon: 103.83, label: "Azure SE Asia" },
  eastasia: { lat: 22.27, lon: 114.17, label: "Azure East Asia" },
  japaneast: { lat: 35.68, lon: 139.77, label: "Azure Japan East" },
  japanwest: { lat: 34.69, lon: 135.5, label: "Azure Japan West" },
  koreacentral: { lat: 37.57, lon: 126.98, label: "Azure Korea Central" },
  centralindia: { lat: 18.97, lon: 72.82, label: "Azure Central India" },
  australiaeast: { lat: -33.87, lon: 151.21, label: "Azure Australia East" },
  brazilsouth: { lat: -23.55, lon: -46.63, label: "Azure Brazil South" },
  canadacentral: { lat: 43.65, lon: -79.38, label: "Azure Canada Central" },
  southafricanorth: { lat: -25.73, lon: 28.22, label: "Azure South Africa North" },
  uaenorth: { lat: 25.27, lon: 55.3, label: "Azure UAE North" },

  // ── DigitalOcean ────────────────────────────────────────────────────────
  "do-nyc": { lat: 40.71, lon: -74.01, label: "DO New York" },
  "do-sfo": { lat: 37.77, lon: -122.42, label: "DO San Francisco" },
  "do-ams": { lat: 52.37, lon: 4.89, label: "DO Amsterdam" },
  "do-tor": { lat: 43.65, lon: -79.38, label: "DO Toronto" },
  "do-blr": { lat: 12.97, lon: 77.59, label: "DO Bangalore" },

  // ── RunPod ──────────────────────────────────────────────────────────────
  "runpod-eu-ro": { lat: 44.43, lon: 26.1, label: "RunPod Romania" },
  "runpod-ca-mtl": { lat: 45.5, lon: -73.57, label: "RunPod Montreal" },

  // ── Northflank ──────────────────────────────────────────────────────────
  // Northflank uses AWS/GCP region names, so most resolve through the main registry.
  // These are just explicit aliases for documentation.

  // ── Generic fallbacks ───────────────────────────────────────────────────
  local: { lat: 37.77, lon: -122.42, label: "Local" },
  default: { lat: 40.71, lon: -74.01, label: "Default" },
  production: { lat: 40.71, lon: -74.01, label: "Production" },
  staging: { lat: 37.77, lon: -122.42, label: "Staging" },
  ssh: { lat: 48.86, lon: 2.35, label: "SSH Remote" },
};

/**
 * Resolve geographic coordinates for a region, optionally considering
 * the provider for alias resolution.
 *
 * Resolution order:
 * 1. Provider-specific alias → canonical region → registry lookup
 * 2. Direct registry lookup by region key
 */
export function resolveRegionCoords(
  region: string | null | undefined,
  provider?: string | null,
): RegionCoord | null {
  if (!region) return null;

  const key = region.toLowerCase();

  // Try provider-specific alias first
  if (provider) {
    const providerKey = provider.toLowerCase();
    const aliases = PROVIDER_ALIASES[providerKey];
    if (aliases) {
      const aliasedKey = aliases[key];
      if (aliasedKey && REGION_COORDS[aliasedKey]) {
        return REGION_COORDS[aliasedKey];
      }
    }
  }

  // Direct registry lookup
  return REGION_COORDS[key] ?? null;
}

/**
 * Returns all known region coordinates (for testing / enumeration).
 */
export function getAllRegionCoords(): Readonly<Record<string, RegionCoord>> {
  return REGION_COORDS;
}
