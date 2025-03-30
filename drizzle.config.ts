import { defineConfig } from "drizzle-kit";

export default process.env.LOCAL_DB_PATH
  ? defineConfig({
      schema: "./db/schema/index.ts",
      out: "./db/drizzle",
      dialect: "sqlite",
      dbCredentials: {
        url: process.env.LOCAL_DB_PATH,
      },
      casing: "snake_case",
    })
  : defineConfig({
      schema: "./db/schema/index.ts",
      out: "./db/drizzle",
      dialect: "sqlite",
      driver: "d1-http",
      dbCredentials: {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
        databaseId: process.env.CLOUDFLARE_DATABASE_ID || "",
        token: process.env.CLOUDFLARE_D1_TOKEN || "",
      },
      casing: "snake_case",
      tablesFilter: ["/^(?!.*_cf_KV).*$/"], // refs. https://github.com/drizzle-team/drizzle-orm/issues/3728#issuecomment-2562063741
    });
