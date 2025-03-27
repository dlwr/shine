import { drizzle } from "drizzle-orm/postgres-js";

import postgres from "postgres";

const getDatabase = () => {
  const connectionString =
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5433/shine";

  const client = postgres(connectionString, {
    prepare: false,
    onnotice: () => {
      /* 通知を無視 */
    },
  });

  return {
    db: drizzle(client, {
      casing: "snake_case",
    }),
    client,
  };
};

export { getDatabase };

export { sql } from "drizzle-orm";
