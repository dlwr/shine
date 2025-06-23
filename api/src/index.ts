import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Environment } from "db";
import { authRoutes } from "./routes/auth";
import { selectionsRoutes } from "./routes/selections";
import { moviesRoutes } from "./routes/movies";
import { adminRoutes } from "./routes/admin";
import { utilitiesRoutes } from "./routes/utilities";

const app = new Hono<{ Bindings: Environment }>();

app.use("*", cors());

// Mount route modules
app.route("/auth", authRoutes);
app.route("/", selectionsRoutes);  // Main endpoint for movie selections
app.route("/movies", moviesRoutes);
app.route("/admin", adminRoutes);
app.route("/", utilitiesRoutes);  // Utility endpoints like fetch-url-title

export default app;