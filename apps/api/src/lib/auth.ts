/**
 * Better Auth server configuration.
 *
 * Configures GitHub OIDC, Google OIDC, and magic link email authentication.
 * Uses Prisma adapter for session/account/verification storage.
 */

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { db } from "./db.js";
import { sendMagicLinkEmail } from "./email.js";
import { logger } from "./logger.js";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),

  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  basePath: "/api/auth",

  emailAndPassword: {
    enabled: false,
  },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
  },

  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
  ],

  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "VIEWER",
        input: false,
      },
      is_active: {
        type: "boolean",
        defaultValue: true,
        input: false,
      },
      password_hash: {
        type: "string",
        required: false,
        input: false,
      },
    },
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "google"],
    },
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      idToken: "id_token",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  verification: {
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  rateLimit: {
    window: 60,
    max: 10,
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const userCount = await db.user.count();
          if (userCount === 0) {
            logger.info({ email: user.email }, "First user — auto-promoting to ADMIN");
            return { data: { ...user, role: "ADMIN", email_verified: true } };
          }
          return { data: { ...user, email_verified: true } };
        },
        after: async (user) => {
          try {
            await db.auditLog.create({
              data: {
                user_id: user.id,
                action: "CREATE",
                resource: "user",
                resource_id: user.id,
                metadata: { method: "auth", email: user.email },
              },
            });
          } catch (err) {
            logger.warn({ err, userId: user.id }, "Failed to write user creation audit log");
          }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          try {
            await db.auditLog.create({
              data: {
                user_id: session.userId,
                action: "LOGIN",
                resource: "user",
                resource_id: session.userId,
                ip_address: session.ipAddress ?? null,
                user_agent: session.userAgent ?? null,
                metadata: { sessionId: session.id, method: "session" },
              },
            });
            await db.user.update({
              where: { id: session.userId },
              data: { last_login_at: new Date() },
            });
          } catch (err) {
            logger.warn({ err, userId: session.userId }, "Failed to write login audit log");
          }
        },
      },
      delete: {
        before: async (session) => {
          try {
            await db.auditLog.create({
              data: {
                user_id: session.userId,
                action: "LOGOUT",
                resource: "user",
                resource_id: session.userId,
                metadata: { sessionId: session.id },
              },
            });
          } catch (err) {
            logger.warn({ err, userId: session.userId }, "Failed to write logout audit log");
          }
        },
      },
    },
  },

  trustedOrigins: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173"],
});

export type Auth = typeof auth;
