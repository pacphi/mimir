/**
 * Hono application factory.
 *
 * The app is created here (separate from the server bootstrap in index.ts)
 * so it can be imported directly in tests without starting an HTTP server.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { loggerMiddleware } from "./middleware/logger.js";
import { instancesRouter } from "./routes/instances.js";
import { lifecycleRouter } from "./routes/instances/lifecycle.js";
import { terminalRouter } from "./routes/instances/terminal.js";
import { healthRouter } from "./routes/health.js";
import { commandsRouter } from "./routes/commands.js";
import { tasksRouter } from "./routes/tasks.js";
import { deploymentsRouter } from "./routes/deployments.js";
import { templatesRouter } from "./routes/templates.js";
import { providersRouter } from "./routes/providers.js";
import { fleetRouter } from "./routes/fleet.js";
import { metricsRouter, instanceMetricsRouter } from "./routes/metrics.js";
import { logsRouter, instanceLogsRouter } from "./routes/logs.js";
import { alertsRouter } from "./routes/alerts.js";
import { adminUsersRouter } from "./routes/admin/users.js";
import { adminTeamsRouter } from "./routes/admin/teams.js";
import { adminExtensionsRouter } from "./routes/admin/extensions.js";
import { auditRouter } from "./routes/audit.js";
import { extensionsRouter } from "./routes/extensions.js";
import { costsRouter } from "./routes/costs.js";
import { otelRouter } from "./routes/otel.js";
import { securityRouter } from "./routes/security.js";
import { driftRouter } from "./routes/drift.js";
import { secretsRouter } from "./routes/secrets.js";
import { profilesRouter } from "./routes/profiles.js";
import { registryRouter } from "./routes/registry.js";
import { versionRouter } from "./routes/version.js";
import { integrationsRouter } from "./routes/integrations.js";
import { wsTicketRouter } from "./routes/ws-ticket.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { devAuthMiddleware, isDevAuthBypassEnabled } from "./middleware/devAuth.js";
import { logger } from "./lib/logger.js";

export function createApp(): Hono {
  const app = new Hono();

  // ── Global middleware ──────────────────────────────────────────────────────

  app.use("*", loggerMiddleware);

  app.use(
    "*",
    cors({
      origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Api-Key", "X-Instance-ID"],
      exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
      credentials: true,
      maxAge: 600,
    }),
  );

  app.use("*", secureHeaders());

  // Dev auth bypass — auto-authenticate as seed admin in development
  if (isDevAuthBypassEnabled()) {
    logger.warn("Dev auth bypass enabled — all requests authenticated as seed admin");
    app.use("/api/v1/*", devAuthMiddleware);
  }

  // Public config endpoint — tells the frontend about runtime settings
  //
  // Image resolution:
  //   SINDRI_DEFAULT_IMAGE — used when user leaves image fields blank
  //     Dev default:  "sindri:v3-ubuntu-dev" (locally-built via `make v3-docker-build-dev`)
  //     Prod example: "ghcr.io/pacphi/sindri:3.1.0"
  //   SINDRI_IMAGE_REGISTRY + SINDRI_IMAGE_VERSION — used for image_config mode
  app.get("/api/config", (c) => {
    return c.json({
      authBypass: isDevAuthBypassEnabled(),
      nodeEnv: process.env.NODE_ENV || "development",
      sindriDefaultImage: process.env.SINDRI_DEFAULT_IMAGE || "sindri:v3-ubuntu-dev",
      sindriImageRegistry: process.env.SINDRI_IMAGE_REGISTRY || "ghcr.io/pacphi/sindri",
      sindriImageVersion: process.env.SINDRI_IMAGE_VERSION || "latest",
      editorFsRoot: process.env.EDITOR_FS_ROOT || "/alt/home/developer/workspace",
      sindriSupportedDistros: (process.env.SINDRI_SUPPORTED_DISTROS || "ubuntu,fedora,opensuse")
        .split(",")
        .map((s) => s.trim()),
      sindriDefaultDistro: process.env.SINDRI_DEFAULT_DISTRO || "ubuntu",
    });
  });

  // ── Routes ─────────────────────────────────────────────────────────────────

  // Auth routes are public (they handle their own auth)
  app.route("/api/auth", authRouter);

  app.route("/health", healthRouter);
  app.route("/api/v1/me", meRouter);
  app.route("/api/v1/instances", instancesRouter);
  app.route("/api/v1/instances", lifecycleRouter);
  app.route("/api/v1/instances", terminalRouter);
  app.route("/api/v1/commands", commandsRouter);
  app.route("/api/v1/tasks", tasksRouter);
  app.route("/api/v1/deployments", deploymentsRouter);
  app.route("/api/v1/templates", templatesRouter);
  app.route("/api/v1/providers", providersRouter);
  app.route("/api/v1/fleet", fleetRouter);
  app.route("/api/v1/metrics", metricsRouter);
  app.route("/api/v1/instances", instanceMetricsRouter);
  app.route("/api/v1/logs", logsRouter);
  app.route("/api/v1/instances", instanceLogsRouter);
  app.route("/api/v1/alerts", alertsRouter);
  app.route("/api/v1/admin/users", adminUsersRouter);
  app.route("/api/v1/admin/teams", adminTeamsRouter);
  app.route("/api/v1/admin/extensions", adminExtensionsRouter);
  app.route("/api/v1/audit", auditRouter);
  app.route("/api/v1/extensions", extensionsRouter);
  app.route("/api/v1/costs", costsRouter);
  app.route("/api/v1/security", securityRouter);
  app.route("/api/v1/drift", driftRouter);
  app.route("/api/v1/secrets", secretsRouter);
  app.route("/api/v1/profiles", profilesRouter);
  app.route("/api/v1/registry", registryRouter);
  app.route("/api/v1/version", versionRouter);
  app.route("/api/v1/integrations", integrationsRouter);
  app.route("/api/v1/ws", wsTicketRouter);
  app.route("/api/v1/otel", otelRouter);

  // 404 handler
  app.notFound((c) => {
    return c.json(
      { error: "Not Found", message: `No route for ${c.req.method} ${c.req.path}` },
      404,
    );
  });

  // Unhandled error handler
  app.onError((err, c) => {
    logger.error({ err, path: c.req.path }, "Unhandled error");
    return c.json({ error: "Internal Server Error", message: "An unexpected error occurred" }, 500);
  });

  return app;
}
