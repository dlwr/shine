import { sql } from "drizzle-orm";
import {
  date,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { awardOrganizations } from "./award-organizations";

export const awardCeremonies = pgTable(
  "award_ceremonies",
  {
    uid: uuid()
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationUid: uuid()
      .notNull()
      .references(() => awardOrganizations.uid),
    ceremonyNumber: integer(),
    year: integer().notNull(),
    startDate: date(),
    endDate: date(),
    location: text(),
    description: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => ({
    uniqueCeremony: unique().on(table.organizationUid, table.year),
  })
);
