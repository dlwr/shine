import {config} from 'dotenv';
import {isNotNull, count, desc, eq, sql} from 'drizzle-orm';
import {getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';

config({path: '.dev.vars'});

async function cleanDuplicateTmdbIds() {
  const database = getDatabase({
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL!,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN!,
    TMDB_API_KEY: process.env.TMDB_API_KEY!,
    TMDB_LEAD_ACCESS_TOKEN: process.env.TMDB_LEAD_ACCESS_TOKEN!,
    OMDB_API_KEY: process.env.OMDB_API_KEY!,
  });

  console.log('Finding duplicate TMDb IDs...');

  const duplicates = await database
    .select({
      tmdbId: movies.tmdbId,
      count: count(movies.uid),
    })
    .from(movies)
    .where(isNotNull(movies.tmdbId))
    .groupBy(movies.tmdbId)
    .having(sql`count(${movies.uid}) > 1`);

  console.log(`Found ${duplicates.length} duplicate TMDb IDs`);

  let cleaned = 0;

  for (const duplicate of duplicates) {
    if (duplicate.tmdbId === null) {
      continue;
    }

    console.log(
      `\nProcessing TMDb ID ${String(duplicate.tmdbId)} (${duplicate.count} movies)`,
    );

    const conflictingMovies = await database
      .select({
        uid: movies.uid,
        imdbId: movies.imdbId,
        year: movies.year,
        createdAt: movies.createdAt,
      })
      .from(movies)
      .where(eq(movies.tmdbId, duplicate.tmdbId))
      .orderBy(desc(movies.createdAt)); // 最新作成順

    // 最初の映画（最新作成）以外のTMDb IDをnullに設定
    const toKeep = conflictingMovies[0];
    const toClean = conflictingMovies.slice(1);

    console.log(
      `  Keeping: ${toKeep.uid} (IMDb: ${toKeep.imdbId ?? 'N/A'}, Year: ${toKeep.year})`,
    );

    for (const movie of toClean) {
      await database
        .update(movies)
        // eslint-disable-next-line unicorn/no-null -- undefinedだとdrizzleが列更新をスキップする
        .set({tmdbId: null})
        .where(eq(movies.uid, movie.uid));

      console.log(
        `  Cleaned: ${movie.uid} (IMDb: ${movie.imdbId ?? 'N/A'}, Year: ${movie.year})`,
      );
      cleaned++;
    }
  }

  console.log(`\n✅ Cleaned up ${cleaned} duplicate TMDb IDs`);

  // 最終確認
  const remainingDuplicates = await database
    .select({
      tmdbId: movies.tmdbId,
      count: count(movies.uid),
    })
    .from(movies)
    .where(isNotNull(movies.tmdbId))
    .groupBy(movies.tmdbId)
    .having(sql`count(${movies.uid}) > 1`);

  console.log(
    `\n📊 Final check: ${remainingDuplicates.length} remaining duplicates`,
  );
}

await cleanDuplicateTmdbIds();
