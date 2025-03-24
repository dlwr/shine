import { sql } from "drizzle-orm";
import {
  boolean,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const translations = pgTable(
  "translations",
  {
    uid: uuid()
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    resourceType: text().notNull(),
    resourceUid: uuid().notNull(),
    languageCode: text().notNull(),
    content: text().notNull(),
    isDefault: boolean().default(false),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => {
    return {
      uniqueTranslation: unique().on(
        table.resourceType,
        table.resourceUid,
        table.languageCode
      ),
    };
  }
);
