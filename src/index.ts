import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema/index";

// Re-export drizzle-orm utilities
export { and, eq, like, not, sql } from "drizzle-orm";

export type Environment = {
  TMDB_API_KEY: string | undefined;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  ADMIN_PASSWORD?: string;
  JWT_SECRET?: string;
};

export const getDatabase = (environment: Environment) => {
  const client = createClient({
    url: environment.TURSO_DATABASE_URL,
    authToken: environment.TURSO_AUTH_TOKEN,
  });

  return drizzle(client, {
    schema: {
      ...schema,
    },
    casing: "snake_case",
  });
};

export type Movie = typeof schema.movies.$inferSelect;
export type NewMovie = typeof schema.movies.$inferInsert;
export type Nomination = typeof schema.nominations.$inferSelect;
export type NewNomination = typeof schema.nominations.$inferInsert;
export type AwardCategory = typeof schema.awardCategories.$inferSelect;
export type NewAwardCategory = typeof schema.awardCategories.$inferInsert;
export type AwardCeremony = typeof schema.awardCeremonies.$inferSelect;
export type NewAwardCeremony = typeof schema.awardCeremonies.$inferInsert;
export type AwardOrganization = typeof schema.awardOrganizations.$inferSelect;
export type NewAwardOrganization =
  typeof schema.awardOrganizations.$inferInsert;
