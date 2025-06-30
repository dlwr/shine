import type { Environment } from "db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  globalErrorHandler,
  notFoundHandler,
} from "./middleware/error-handler";
import { securityHeaders } from "./middleware/security";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { documentationRoutes } from "./routes/documentation";
import { moviesRoutes } from "./routes/movies";
import { selectionsRoutes } from "./routes/selections";
import { utilitiesRoutes } from "./routes/utilities";

const app = new Hono<{ Bindings: Environment }>();

app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow all localhost origins in development
      if (origin?.startsWith("http://localhost:")) {
        return origin;
      }
      // Production origins
      const allowedOrigins = [
        "https://shine-film.com",
        "https://dlwr.github.io",
        "https://shine-front-production.yuta25.workers.dev",
      ];
      return allowedOrigins.includes(origin || "") ? origin : false;
    },
    credentials: true,
  }),
);

// Apply security headers to all routes except documentation
app.use("*", async (c, next) => {
  return c.req.path.startsWith("/docs")
    ? await next()
    : await securityHeaders(c, next);
});
app.use("*", globalErrorHandler);

// Mount route modules
app.route("/auth", authRoutes);
app.route("/docs", documentationRoutes); // API documentation
app.route("/", selectionsRoutes); // Main endpoint for movie selections
app.route("/movies", moviesRoutes);
app.route("/admin", adminRoutes);
app.route("/", utilitiesRoutes); // Utility endpoints like fetch-url-title

app.notFound(notFoundHandler);

export default app;
