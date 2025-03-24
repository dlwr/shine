import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Create a function to check for duplicate movies
const createMovieUniqueConstraintSQL = sql`
  CREATE OR REPLACE FUNCTION check_movie_unique_title()
  RETURNS TRIGGER AS $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM movies m
      JOIN translations t ON t.resource_uid = m.uid
      WHERE t.resource_type = 'movie_title'
      AND t.is_default = true
      AND t.language_code = NEW.original_language
      AND t.content = (
        SELECT content
        FROM translations
        WHERE resource_type = 'movie_title'
        AND resource_uid = NEW.uid
        AND is_default = true
        AND language_code = NEW.original_language
        LIMIT 1
      )
      AND m.uid != NEW.uid
    ) THEN
      RAISE EXCEPTION 'Duplicate movie title found for the same language';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER movie_unique_title_trigger
    AFTER INSERT OR UPDATE ON movies
    FOR EACH ROW
    EXECUTE FUNCTION check_movie_unique_title();
`;

export const movies = pgTable("movies", {
  uid: uuid()
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  originalLanguage: text().notNull().default("en"),
  year: integer(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

// Export the SQL to create the unique constraint
export const movieConstraints = {
  createUniqueConstraint: createMovieUniqueConstraintSQL,
};
