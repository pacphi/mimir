import { defineConfig } from "prisma/config";

/**
 * Build the datasource URL from component env vars, matching the logic in
 * src/lib/env.ts. We inline it here because prisma.config.ts cannot import
 * from the app source tree.
 */
function datasourceUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const password = process.env.POSTGRES_PASSWORD;
  if (!password) return undefined; // prisma generate works without a live DB

  const user = process.env.POSTGRES_USER ?? "mimir";
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const db = process.env.POSTGRES_DB ?? "mimir";

  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

export default defineConfig({
  schema: "./prisma/schema.prisma",
  ...(datasourceUrl() ? { datasource: { url: datasourceUrl()! } } : {}),
  migrations: {
    path: "./prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
});
