import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "hono";
import type { Environment } from "../../../src";
import { authMiddleware, createJWT, verifyJWT } from "../auth";

describe("JWT Authentication", () => {
  const testSecret = "test-secret-key";

  describe("createJWT", () => {
    it("should create a valid JWT token", async () => {
      const token = await createJWT(testSecret);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });
  });

  describe("verifyJWT", () => {
    it("should verify a JWT token created with the same secret", async () => {
      const token = await createJWT(testSecret);
      const isValid = await verifyJWT(token, testSecret);
      expect(isValid).toBe(true);
    });

    it("should reject JWT token with different secret", async () => {
      const token = await createJWT(testSecret);
      const isValid = await verifyJWT(token, "different-secret");
      expect(isValid).toBe(false);
    });

    it("should reject invalid JWT token", async () => {
      const isValid = await verifyJWT("invalid-token", testSecret);
      expect(isValid).toBe(false);
    });
  });

  describe("authMiddleware", () => {
    let mockContext: Context<{ Bindings: Environment }>;
    let mockNext: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockNext = vi.fn();
      mockContext = {
        req: {
          header: vi.fn(),
        },
        json: vi.fn(),
        env: {
          JWT_SECRET: testSecret,
          TURSO_DATABASE_URL: "",
          TURSO_AUTH_TOKEN: "",
          TMDB_API_KEY: undefined,
        },
      } as unknown as Context<{ Bindings: Environment }>;
    });

    it("should return 401 when no Authorization header", async () => {
      (mockContext.req.header as ReturnType<typeof vi.fn>).mockReturnValue("");

      await authMiddleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        { 
          error: "Authentication token is required",
          code: "AUTHENTICATION_ERROR",
          details: { reason: "MISSING_TOKEN" }
        },
        401
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when Authorization header does not start with Bearer", async () => {
      (mockContext.req.header as ReturnType<typeof vi.fn>).mockReturnValue("Basic token");

      await authMiddleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        { 
          error: "Authentication token is required",
          code: "AUTHENTICATION_ERROR",
          details: { reason: "MISSING_TOKEN" }
        },
        401
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 500 when JWT_SECRET is not configured", async () => {
      (mockContext.req.header as ReturnType<typeof vi.fn>).mockReturnValue("Bearer valid-token");
      mockContext.env.JWT_SECRET = undefined;

      await authMiddleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        { 
          error: "Internal server error",
          code: "INTERNAL_ERROR"
        },
        500
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when token is invalid", async () => {
      (mockContext.req.header as ReturnType<typeof vi.fn>).mockReturnValue("Bearer invalid-token");

      await authMiddleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        { 
          error: "Invalid authentication token",
          code: "AUTHENTICATION_ERROR",
          details: { reason: "INVALID_TOKEN" }
        },
        401
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next when token is valid", async () => {
      const validToken = await createJWT(testSecret);
      (mockContext.req.header as ReturnType<typeof vi.fn>).mockReturnValue(`Bearer ${validToken}`);

      await authMiddleware(mockContext, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.json).not.toHaveBeenCalled();
    });
  });
});
