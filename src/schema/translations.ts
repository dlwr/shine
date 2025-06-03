import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { generateUUID } from "../utils/uuid";

export const translations = sqliteTable(
  "translations",
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    resourceType: text().notNull(),
    resourceUid: text().notNull(),
    languageCode: text().notNull(),
    content: text().notNull(),
    isDefault: integer().default(0),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => {
    return [
      unique().on(table.resourceType, table.resourceUid, table.languageCode),
    ];
  }
);
