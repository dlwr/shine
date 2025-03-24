import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const awardOrganizations = pgTable("award_organizations", {
  uid: uuid()
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  name: text().notNull().unique(),
  shortName: text().unique(),
  country: text(),
  establishedYear: integer(),
  description: text(),
  frequency: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});
