import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { awardCategories } from "./award-categories";
import { awardCeremonies } from "./award-ceremonies";
import { movies } from "./movies";

export const nominations = pgTable("nominations", {
  uid: uuid()
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  movieUid: uuid()
    .notNull()
    .references(() => movies.uid),
  ceremonyUid: uuid()
    .notNull()
    .references(() => awardCeremonies.uid),
  categoryUid: uuid()
    .notNull()
    .references(() => awardCategories.uid),
  isWinner: boolean().notNull().default(false),
  specialMention: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});
