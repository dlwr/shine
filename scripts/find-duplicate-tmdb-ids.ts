import {config} from 'dotenv';
import {isNotNull, count, sql, eq} from 'drizzle-orm';
import {getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';

config({path: '.dev.vars'});

async function findDuplicateTmdbIds() {
  const db = getDatabase({
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL!,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN!,
    TMDB_API_KEY: process.env.TMDB_API_KEY!,
    TMDB_LEAD_ACCESS_TOKEN: process.env.TMDB_LEAD_ACCESS_TOKEN!,
    OMDB_API_KEY: process.env.OMDB_API_KEY!,
  });

  console.log('Checking for duplicate TMDb IDs...');

  const duplicates = await db
    .select({
      tmdbId: movies.tmdbId,
      count: count(movies.uid),
    })
    .from(movies)
    .where(isNotNull(movies.tmdbId))
    .groupBy(movies.tmdbId)
    .having(sql`count(${movies.uid}) > 1`);

  console.log(`Found ${duplicates.length} duplicate TMDb IDs`);

  for (const duplicate of duplicates) {
    console.log(
      `\nTMDb ID ${duplicate.tmdbId} is used by ${duplicate.count} movies:`,
    );

    const conflictingMovies = await db
      .select({
        uid: movies.uid,
        imdbId: movies.imdbId,
        year: movies.year,
        createdAt: movies.createdAt,
      })
      .from(movies)
      .where(eq(movies.tmdbId, duplicate.tmdbId))
      .orderBy(movies.createdAt);

    for (const movie of conflictingMovies) {
      console.log(
        `  - ${movie.uid}: IMDb ${movie.imdbId}, Year ${movie.year}, Created: ${new Date(movie.createdAt * 1000).toISOString()}`,
      );
    }
  }
}

await findDuplicateTmdbIds();
