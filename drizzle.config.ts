import type { Config } from "drizzle-kit";

export default {
  schema: "./packages/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: "localhost",
    port: 5433,
    database: "shine",
    user: "postgres",
    password: "postgres",
    ssl: false,
  },
  casing: "snake_case",
} satisfies Config;
