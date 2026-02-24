import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  // DATABASE_URL is only required for migrate/deploy/studio commands, not for generate.
  ...(process.env.DATABASE_URL
    ? { datasource: { url: process.env.DATABASE_URL } }
    : {}),
  migrations: {
    path: "./prisma/migrations",
  },
});
