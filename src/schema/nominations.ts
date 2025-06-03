import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { generateUUID } from "../utils/uuid.js";
import { awardCategories } from "./award-categories.js";
import { awardCeremonies } from "./award-ceremonies.js";
import { movies } from "./movies.js";

export const nominations = sqliteTable(
  "nominations",
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    movieUid: text()
      .notNull()
      .references(() => movies.uid),
    ceremonyUid: text()
      .notNull()
      .references(() => awardCeremonies.uid),
    categoryUid: text()
      .notNull()
      .references(() => awardCategories.uid),
    isWinner: integer().notNull().default(0),
    specialMention: text(),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [unique().on(table.movieUid, table.ceremonyUid, table.categoryUid)]
);
