import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import config from "../drizzle.config";
import * as schema from "./schema";
import * as awardCategoriesSchema from "./schema/award-categories";
import * as awardCeremoniesSchema from "./schema/award-ceremonies";
import * as awardOrganizationsSchema from "./schema/award-organizations";
import * as moviesSchema from "./schema/movies";
import * as nominationsSchema from "./schema/nominations";
const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5433/shine";

export const client = postgres(connectionString);
export const database = drizzle(client, {
  schema: schema,
  casing: config.casing,
});

export type Movie = typeof moviesSchema.movies.$inferSelect;
export type NewMovie = typeof moviesSchema.movies.$inferInsert;
export type Nomination = typeof nominationsSchema.nominations.$inferSelect;
export type NewNomination = typeof nominationsSchema.nominations.$inferInsert;
export type AwardCategory =
  typeof awardCategoriesSchema.awardCategories.$inferSelect;
export type NewAwardCategory =
  typeof awardCategoriesSchema.awardCategories.$inferInsert;
export type AwardCeremony =
  typeof awardCeremoniesSchema.awardCeremonies.$inferSelect;
export type NewAwardCeremony =
  typeof awardCeremoniesSchema.awardCeremonies.$inferInsert;
export type AwardOrganization =
  typeof awardOrganizationsSchema.awardOrganizations.$inferSelect;
export type NewAwardOrganization =
  typeof awardOrganizationsSchema.awardOrganizations.$inferInsert;
