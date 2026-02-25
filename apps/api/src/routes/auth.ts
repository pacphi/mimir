/**
 * Better Auth catch-all route handler.
 */

import { Hono } from "hono";
import { auth } from "../lib/auth.js";

export const authRouter = new Hono();

authRouter.all("/*", async (c) => {
  return auth.handler(c.req.raw);
});
