import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { generateUUID } from "../utils/uuid.js";
import { awardOrganizations } from "./award-organizations.js";

export const awardCategories = sqliteTable(
  "award_categories",
  {
    uid: text("uid")
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    organizationUid: text()
      .notNull()
      .references(() => awardOrganizations.uid),
    name: text().notNull(),
    nameEn: text(),
    nameLocal: text(),
    shortName: text(),
    description: text(),
    firstAwardedYear: integer(),
    discontinuedYear: integer(),
    isActive: integer().default(1),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    unique().on(table.name),
    unique().on(table.organizationUid, table.shortName),
  ]
);
