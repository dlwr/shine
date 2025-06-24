import type { Environment } from "db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { securityHeaders } from "./middleware/security";
import { globalErrorHandler, notFoundHandler } from "./middleware/error-handler";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { moviesRoutes } from "./routes/movies";
import { selectionsRoutes } from "./routes/selections";
import { utilitiesRoutes } from "./routes/utilities";

const app = new Hono<{ Bindings: Environment }>();

app.use(
  "*",
  cors({
    origin: [
      "https://shine-film.com",
      "https://dlwr.github.io",
      "https://shine-front-production.yuta25.workers.dev",
      "http://localhost:3000",
      "http://localhost:4321",
      "http://localhost:8787",
      "http://localhost:8888",
      "http://localhost:8889",
      "http://localhost:5173",
    ],
    credentials: true,
  })
);

app.use("*", securityHeaders);
app.use("*", globalErrorHandler);

// Mount route modules
app.route("/auth", authRoutes);
app.route("/", selectionsRoutes); // Main endpoint for movie selections
app.route("/movies", moviesRoutes);
app.route("/admin", adminRoutes);
app.route("/", utilitiesRoutes); // Utility endpoints like fetch-url-title

app.notFound(notFoundHandler);

export default app;
