/**
 * Secret denylist — prevents users from overriding system-critical
 * environment variables via the deployment wizard or Expert YAML.
 *
 * Three categories are blocked:
 *   1. Exact keys (e.g. AUTHORIZED_KEYS, DATABASE_URL)
 *   2. Prefix patterns (e.g. SINDRI_*, DRAUPNIR_*, PRICING_*)
 *   3. Server-internal secrets that must never reach subprocesses
 */

/** Exact environment variable names that users may not set. */
export const RESERVED_SECRET_KEYS: ReadonlySet<string> = new Set([
  // SSH key injection — managed by the platform
  "AUTHORIZED_KEYS",

  // Server-internal secrets
  "DATABASE_URL",
  "POSTGRES_PASSWORD",
  "POSTGRES_USER",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_DB",
  "JWT_SECRET",
  "SESSION_SECRET",
  "SECRET_VAULT_KEY",
  "REDIS_URL",
  "AUTH_BYPASS",

  // Console connection — injected by resolveConsolePlaceholders
  "SINDRI_CONSOLE_URL",
  "SINDRI_CONSOLE_API_KEY",
]);

/** Prefixes that are reserved for platform use. */
export const RESERVED_SECRET_PREFIXES: readonly string[] = ["SINDRI_", "DRAUPNIR_", "PRICING_"];

/**
 * Returns true if the given key is reserved (exact match or prefix match).
 * Comparison is case-insensitive for safety.
 */
export function isReservedSecretKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (RESERVED_SECRET_KEYS.has(upper)) return true;
  return RESERVED_SECRET_PREFIXES.some((prefix) => upper.startsWith(prefix));
}
