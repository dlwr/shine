import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export interface Environment {
  DB: D1Database;
}

export const getDatabase = (environment: Environment) => {
  return drizzle(environment.DB, {
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
