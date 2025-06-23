import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Environment } from "db";
import { authRoutes } from "./routes/auth";
import { selectionsRoutes } from "./routes/selections";
import { moviesRoutes } from "./routes/movies";
import { adminRoutes } from "./routes/admin";
import { utilitiesRoutes } from "./routes/utilities";
import { securityHeaders } from "./middleware/security";

const app = new Hono<{ Bindings: Environment }>();

app.use("*", cors({
  origin: [
    "https://shine.yuta25.jp",
    "https://dlwr.github.io",
    "http://localhost:3000",
    "http://localhost:4321",
    "http://localhost:8787",
    "http://localhost:8888",
    "http://localhost:8889",
    "http://localhost:5173"
  ],
  credentials: true
}));

app.use("*", securityHeaders);

// Mount route modules
app.route("/auth", authRoutes);
app.route("/", selectionsRoutes);  // Main endpoint for movie selections
app.route("/movies", moviesRoutes);
app.route("/admin", adminRoutes);
app.route("/", utilitiesRoutes);  // Utility endpoints like fetch-url-title

export default app;