import { Hono } from "hono";
import { createJWT } from "../auth";
import type { Environment } from "db";

export const authRoutes = new Hono<{ Bindings: Environment }>();

authRoutes.post("/login", async (c) => {
  const { password } = await c.req.json();

  if (!password || !c.env.ADMIN_PASSWORD || password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: "Invalid password" }, 401);
  }

  if (!c.env.JWT_SECRET) {
    return c.json({ error: "JWT_SECRET not configured" }, 500);
  }

  const token = await createJWT(c.env.JWT_SECRET);
  return c.json({ token });
});