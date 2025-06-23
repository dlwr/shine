import { Hono } from "hono";
import { createJWT } from "../auth";
import type { Environment } from "db";
import { createAuthenticationError, createInternalServerError, createValidationError } from "../utils/error-handlers";

export const authRoutes = new Hono<{ Bindings: Environment }>();

authRoutes.post("/login", async (c) => {
  try {
    const { password } = await c.req.json();

    if (!password) {
      return createValidationError(c, [{ field: 'password', message: 'Password is required' }]);
    }

    if (!c.env.ADMIN_PASSWORD) {
      return createInternalServerError(c, new Error('ADMIN_PASSWORD not configured'), 'authentication setup');
    }

    if (!c.env.JWT_SECRET) {
      return createInternalServerError(c, new Error('JWT_SECRET not configured'), 'authentication setup');
    }

    if (password !== c.env.ADMIN_PASSWORD) {
      return createAuthenticationError(c, 'INVALID_CREDENTIALS');
    }

    const token = await createJWT(c.env.JWT_SECRET);
    return c.json({ token });
  } catch (error) {
    return createInternalServerError(c, error, 'authentication');
  }
});