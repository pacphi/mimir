/**
 * Integration status routes.
 *
 *   GET /api/v1/integrations                    — all platform integrations with status
 *   GET /api/v1/integrations/:id                — single platform integration status
 *   GET /api/v1/integrations/providers           — all provider credential specs
 *   GET /api/v1/integrations/providers/:providerId — single provider's required credentials
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitDefault } from "../middleware/rateLimit.js";
import {
  getPlatformIntegrationStatuses,
  getPlatformIntegrationStatus,
  getProviderCredentialSpecs,
  getProviderCredentialSpec,
} from "../services/integrations.service.js";

export const integrationsRouter = new Hono();

integrationsRouter.use("*", authMiddleware);

// List all platform integrations with configuration status
integrationsRouter.get("/", rateLimitDefault, async (c) => {
  const statuses = await getPlatformIntegrationStatuses();
  return c.json({ data: statuses, total: statuses.length });
});

// Provider credential specs (must be before /:id to avoid route conflict)
integrationsRouter.get("/providers", rateLimitDefault, (c) => {
  const specs = getProviderCredentialSpecs();
  return c.json({ data: specs, total: specs.length });
});

integrationsRouter.get("/providers/:providerId", rateLimitDefault, (c) => {
  const spec = getProviderCredentialSpec(c.req.param("providerId"));
  if (!spec) {
    return c.json({ error: "Not Found", message: "Provider not found" }, 404);
  }
  return c.json(spec);
});

// Single platform integration status
integrationsRouter.get("/:id", rateLimitDefault, async (c) => {
  const status = await getPlatformIntegrationStatus(c.req.param("id"));
  if (!status) {
    return c.json({ error: "Not Found", message: "Integration not found" }, 404);
  }
  return c.json(status);
});
