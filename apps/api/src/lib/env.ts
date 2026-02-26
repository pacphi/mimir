/**
 * Environment-variable helpers that construct connection URLs from component
 * variables. If `DATABASE_URL` or `REDIS_URL` is already set (e.g. by Docker
 * Compose), those values take precedence.
 */

/**
 * Returns a PostgreSQL connection URL.
 *
 * Priority: `DATABASE_URL` env var → constructed from `POSTGRES_*` vars.
 * Defaults: user=`mimir`, host=`localhost`, port=`5432`, db=`mimir`.
 * `POSTGRES_PASSWORD` is **required** when constructing from components.
 */
export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const user = process.env.POSTGRES_USER ?? "mimir";
  const password = process.env.POSTGRES_PASSWORD;
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const db = process.env.POSTGRES_DB ?? "mimir";

  if (!password) {
    throw new Error(
      "Either DATABASE_URL or POSTGRES_PASSWORD must be set. " +
        "See .env.example for the required variables.",
    );
  }

  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

/**
 * Returns a Redis connection URL.
 *
 * Priority: `REDIS_URL` env var → constructed from `REDIS_HOST` + `REDIS_PORT`.
 * Defaults: host=`localhost`, port=`6379`.
 */
export function getRedisUrl(): string {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const host = process.env.REDIS_HOST ?? "localhost";
  const port = process.env.REDIS_PORT ?? "6379";

  return `redis://${host}:${port}`;
}
