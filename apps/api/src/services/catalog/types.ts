/**
 * Normalized compute catalog types.
 *
 * All provider-specific data is normalized into these types so the frontend
 * can render a consistent UI regardless of provider.
 */

export interface ComputeSize {
  id: string;
  name: string;
  provider: string;
  category: "cpu" | "gpu";
  vcpus: number;
  memory_gb: number;
  storage_gb: number;
  gpu_name?: string;
  gpu_count?: number;
  gpu_memory_gb?: number;
  price_per_hour: number;
  price_per_month: number;
  price_source: "api" | "static" | "formula" | "none";
  availability?: "high" | "low" | "none";
  regions?: string[];
}

export interface ComputeCatalog {
  provider: string;
  sizes: ComputeSize[];
  storage_price_gb_month: number;
  network_egress_gb_price: number;
  network_egress_free_gb: number;
  fetched_at: string;
  source: "live" | "cached" | "fallback";
  ttl_seconds: number;
}

export interface CostEstimate {
  compute: number;
  storage: number;
  network: number;
  total: number;
  currency: "USD";
}

export interface CatalogFetcherConfig {
  enabled: boolean;
  api_key_env?: string;
  refresh_interval_ms: number;
  ttl_seconds: number;
  regions?: string[];
  supports_regional_pricing: boolean;
}

export interface CatalogConfig {
  providers: Record<string, CatalogFetcherConfig>;
}

export type CatalogFetcher = (
  config: CatalogFetcherConfig,
  region?: string,
) => Promise<ComputeCatalog | null>;
