import {config} from 'dotenv';
import {and, eq, isNull} from 'drizzle-orm';
import {getDatabase} from '../packages/database/src/index.ts';
import {movies} from '../packages/database/src/schema/movies.ts';
import {nominations} from '../packages/database/src/schema/nominations.ts';
import {movieSelections} from '../packages/database/src/schema/movie-selections.ts';

config({path: '.dev.vars'});

const requiredEnvVars = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(
      `${key} is required. Please add it to .dev.vars or the environment.`,
    );
  }
}

const db = getDatabase({
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL!,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN!,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_LEAD_ACCESS_TOKEN: process.env.TMDB_LEAD_ACCESS_TOKEN,
  OMDB_API_KEY: process.env.OMDB_API_KEY,
});

async function softDeleteOrphanMovies() {
  console.log(
    '🔍 Scanning for movies without nominations (and not already deleted)...',
  );

  const orphanMovies = await db
    .select({
      uid: movies.uid,
      imdbId: movies.imdbId,
      tmdbId: movies.tmdbId,
      year: movies.year,
    })
    .from(movies)
    .leftJoin(nominations, eq(nominations.movieUid, movies.uid))
    .where(and(isNull(nominations.uid), isNull(movies.deletedAt)));

  if (orphanMovies.length === 0) {
    console.log('✅ No orphan movies found. Nothing to do.');
    return;
  }

  console.log(
    `📝 Found ${orphanMovies.length} orphan movies. Applying soft delete...`,
  );
  const now = Math.floor(Date.now() / 1000);

  await db.transaction(async trx => {
    for (const movie of orphanMovies) {
      await trx
        .update(movies)
        .set({deletedAt: now})
        .where(eq(movies.uid, movie.uid));

      const selectionsRemoved = await trx
        .delete(movieSelections)
        .where(eq(movieSelections.movieId, movie.uid));

      console.log(
        `  • Soft-deleted movie ${movie.uid} (IMDb: ${movie.imdbId ?? 'N/A'}, TMDB: ${movie.tmdbId ?? 'N/A'}, Year: ${
          movie.year ?? 'N/A'
        }) – removed ${selectionsRemoved.rowsAffected ?? 0} selection(s)`,
      );
    }
  });

  console.log('🎉 Completed soft deletion of orphan movies.');
}

await softDeleteOrphanMovies();
