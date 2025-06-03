import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { generateUUID } from "../utils/uuid.js";

export const awardOrganizations = sqliteTable("award_organizations", {
  uid: text("uid")
    .primaryKey()
    .$defaultFn(() => generateUUID()),
  name: text().notNull().unique(),
  shortName: text().unique(),
  country: text(),
  establishedYear: integer(),
  description: text(),
  frequency: text(),
  createdAt: integer()
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer()
    .notNull()
    .default(sql`(unixepoch())`),
});
