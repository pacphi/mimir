/**
 * Startup environment validation.
 *
 * Validates required environment variables at boot using Zod.
 * Hard-fails in production if critical vars are missing;
 * warns in development about placeholder values.
 */

import { z } from "zod";
import { logger } from "./logger.js";

const envSchema = z.object({
  // Database — one of DATABASE_URL or POSTGRES_PASSWORD required
  DATABASE_URL: z.string().optional(),
  POSTGRES_PASSWORD: z.string().optional(),
  POSTGRES_USER: z.string().default("mimir"),
  POSTGRES_HOST: z.string().default("localhost"),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default("mimir"),

  // Security
  JWT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(1),
  SECRET_VAULT_KEY: z.string().optional(),
  SINDRI_CONSOLE_API_KEY: z.string().min(1),

  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
});

const PLACEHOLDER_VALUES = new Set([
  "changeme",
  "change-me",
  "dev-api-key-change-me",
  "secret",
  "password",
]);

export function validateEnv(): void {
  const result = envSchema.safeParse(process.env);
  const isProd = process.env.NODE_ENV === "production";

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    const msg = `Environment validation failed:\n${issues}`;
    if (isProd) {
      logger.fatal(msg);
      process.exit(1);
    }
    logger.warn(msg);
    return;
  }

  const env = result.data;

  // Database connectivity check
  if (!env.DATABASE_URL && !env.POSTGRES_PASSWORD) {
    const msg = "Neither DATABASE_URL nor POSTGRES_PASSWORD is set — database connection will fail";
    if (isProd) {
      logger.fatal(msg);
      process.exit(1);
    }
    logger.warn(msg);
  }

  // SECRET_VAULT_KEY is critical for the secrets vault
  if (!env.SECRET_VAULT_KEY) {
    const msg =
      "SECRET_VAULT_KEY is not set — secrets vault encryption will fail. Generate with: openssl rand -hex 32";
    if (isProd) {
      logger.fatal(msg);
      process.exit(1);
    }
    logger.warn(msg);
  }

  // AUTH_BYPASS must never be set in production
  if (process.env.AUTH_BYPASS === "true" && isProd) {
    logger.fatal(
      "AUTH_BYPASS=true is set in production — this would bypass all authentication. Aborting.",
    );
    process.exit(1);
  }

  // Warn about placeholder values in security-sensitive vars
  const securityVars = ["JWT_SECRET", "SESSION_SECRET", "SINDRI_CONSOLE_API_KEY"] as const;
  for (const varName of securityVars) {
    const value = env[varName];
    if (PLACEHOLDER_VALUES.has(value.toLowerCase())) {
      const msg = `${varName} is set to a placeholder value ("${value}") — generate a real secret with: openssl rand -hex 32`;
      if (isProd) {
        logger.fatal(msg);
        process.exit(1);
      }
      logger.warn(msg);
    }
  }
}
