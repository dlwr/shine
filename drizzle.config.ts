import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config();

const environment = process.env.NODE_ENV || "development";
const isDevelopment = environment === "development";

const databaseUrl =
  process.env.TURSO_DATABASE_URL ||
  (isDevelopment
    ? process.env.TURSO_DATABASE_URL_DEV
    : process.env.TURSO_DATABASE_URL_PROD) ||
  "";
const authToken =
  process.env.TURSO_AUTH_TOKEN ||
  (isDevelopment
    ? process.env.TURSO_AUTH_TOKEN_DEV
    : process.env.TURSO_AUTH_TOKEN_PROD) ||
  "";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "turso",
  dbCredentials: {
    url: databaseUrl,
    authToken: authToken,
  },
  casing: "snake_case",
});
