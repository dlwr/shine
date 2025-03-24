import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { awardOrganizations } from "./award-organizations";

export const awardCategories = pgTable(
  "award_categories",
  {
    uid: uuid()
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationUid: uuid()
      .notNull()
      .references(() => awardOrganizations.uid),
    name: text().notNull(),
    nameEn: text(),
    nameLocal: text(),
    shortName: text(),
    description: text(),
    firstAwardedYear: integer(),
    discontinuedYear: integer(),
    isActive: boolean().default(true),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => ({
    uniqueName: unique().on(table.name),
    uniqueShortName: unique().on(table.organizationUid, table.shortName),
  })
);
