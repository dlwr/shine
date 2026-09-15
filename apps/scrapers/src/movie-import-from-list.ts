import {readFileSync} from 'node:fs';
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {fetchTMDBConfig} from './common/tmdb-client';
import {createAwardStructure} from './movie-import-from-list/award-structure';
import {
  createNewMovieForBatch,
  findExistingMovieForTmdbMovie,
  searchMovieOnTMDB,
  updateExistingMovie,
  type ImportContext,
} from './movie-import-from-list/tmdb-movie';

/**
 * Movie-list.jsonから映画をインポートする
 */
export async function importMoviesFromList(
  filePath: string,
  awardName: string,
  categoryName: string,
  environment: Environment,
  limit?: number,
  shouldDryRun = false,
): Promise<void> {
  const tmdbApiKey = environment.TMDB_API_KEY || '';

  if (!tmdbApiKey) {
    throw new Error('context.tmdbApiKey is required');
  }

  // TMDB設定を取得
  const context: ImportContext = {
    environment,
    tmdbApiKey,
    tmdbConfig: await fetchTMDBConfig(tmdbApiKey),
    isDryRun: shouldDryRun,
  };
  console.log('TMDB config loaded');

  // JSONファイルを読み込み
  const fileContent = readFileSync(filePath, 'utf8');
  const allMovieTitles: string[] = JSON.parse(fileContent);

  // Limitが指定されている場合は制限
  const movieTitles = limit ? allMovieTitles.slice(0, limit) : allMovieTitles;

  if (context.isDryRun) {
    console.log(
      '[DRY RUN MODE] No actual database operations will be performed',
    );
  }

  console.log(
    `${context.isDryRun ? '[DRY RUN] Would import' : 'Importing'} ${movieTitles.length}${
      limit ? ` (limited from ${allMovieTitles.length})` : ''
    } movies from ${filePath}`,
  );

  // アワード組織とカテゴリーを作成
  const {organizationUid, categoryUid, ceremonyUid} =
    await createAwardStructure(context, awardName, categoryName);

  // バッチ処理用の配列
  const translationsBatch: Array<typeof translations.$inferInsert> = [];
  const posterUrlsBatch: Array<typeof posterUrls.$inferInsert> = [];
  const nominationsBatch: Array<typeof nominations.$inferInsert> = [];

  // 各映画を処理
  for (const [index, title] of movieTitles.entries()) {
    console.log(`\n[${index + 1}/${movieTitles.length}] Processing: ${title}`);

    try {
      const batchData = await processMovieForBatch(
        context,
        title,
        organizationUid,
        categoryUid,
        ceremonyUid,
      );
      if (batchData) {
        translationsBatch.push(...batchData.translations);
        if (batchData.posterUrl) {
          posterUrlsBatch.push(batchData.posterUrl);
        }

        if (batchData.nomination) {
          nominationsBatch.push(batchData.nomination);
        }
      }
    } catch (error) {
      console.error(`Error processing ${title}:`, error);
    }
  }

  // バッチでデータを挿入
  if (context.isDryRun) {
    console.log('\n[DRY RUN] Would insert:');
    console.log(`  - ${translationsBatch.length} translations`);
    console.log(`  - ${posterUrlsBatch.length} poster URLs`);
    console.log(`  - ${nominationsBatch.length} nominations`);
  } else {
    const database = getDatabase(context.environment);

    if (translationsBatch.length > 0) {
      console.log(
        `\nInserting ${translationsBatch.length} translations in batch...`,
      );
      await database
        .insert(translations)
        .values(translationsBatch)
        .onConflictDoNothing();
    }

    if (posterUrlsBatch.length > 0) {
      console.log(
        `Inserting ${posterUrlsBatch.length} poster URLs in batch...`,
      );
      await database
        .insert(posterUrls)
        .values(posterUrlsBatch)
        .onConflictDoNothing();
    }

    if (nominationsBatch.length > 0) {
      console.log(
        `Inserting ${nominationsBatch.length} nominations in batch...`,
      );
      await database
        .insert(nominations)
        .values(nominationsBatch)
        .onConflictDoNothing();
    }
  }

  console.log(`\n${context.isDryRun ? '[DRY RUN] ' : ''}Import completed!`);
}

/**
 * バッチ処理用に映画を処理
 */
async function processMovieForBatch(
  context: ImportContext,
  title: string,
  _organizationUid: string,
  categoryUid: string,
  ceremonyUid: string,
): Promise<
  | {
      translations: Array<typeof translations.$inferInsert>;
      posterUrl?: typeof posterUrls.$inferInsert;
      nomination?: typeof nominations.$inferInsert;
    }
  | undefined
> {
  // TMDBで映画を検索
  const tmdbMovie = await searchMovieOnTMDB(context, title);

  if (!tmdbMovie) {
    console.log(`  TMDB search failed for: ${title}`);
    return undefined;
  }

  if (context.isDryRun) {
    console.log(
      `[DRY RUN] Would process movie: ${tmdbMovie.title} (${tmdbMovie.release_date?.split('-', 1)[0]}) ${
        tmdbMovie.imdb_id ? `IMDb: ${tmdbMovie.imdb_id}` : ''
      }`,
    );
    return undefined;
  }

  const database = getDatabase(context.environment);

  const existingMovie = await findExistingMovieForTmdbMovie(
    database,
    tmdbMovie,
  );

  if (existingMovie?.deletedAt) {
    console.log(
      `  Movie is soft-deleted, skipping: ${tmdbMovie.title} (UID: ${existingMovie.uid})`,
    );
    return undefined;
  }

  let movieUid: string;
  const translationsBatch: Array<typeof translations.$inferInsert> = [];
  let posterUrlData: typeof posterUrls.$inferInsert | undefined;

  if (existingMovie) {
    console.log(`  Found existing movie (UID: ${existingMovie.uid})`);
    movieUid = existingMovie.uid;

    // TMDBデータで既存映画を更新
    await updateExistingMovie(context, existingMovie.uid, tmdbMovie);
  } else {
    console.log(`  Creating new movie: ${tmdbMovie.title}`);
    const result = await createNewMovieForBatch(context, tmdbMovie);
    movieUid = result.movieUid;
    translationsBatch.push(...result.translations);
    posterUrlData = result.posterUrl;
  }

  // 既存のノミネーションをチェック
  const [existingNomination] = await database
    .select()
    .from(nominations)
    .where(
      and(
        eq(nominations.movieUid, movieUid),
        eq(nominations.categoryUid, categoryUid),
        eq(nominations.ceremonyUid, ceremonyUid),
      ),
    )
    .limit(1);

  let nominationData: typeof nominations.$inferInsert | undefined;
  if (existingNomination) {
    console.log('  Nomination already exists');
  } else {
    nominationData = {
      movieUid,
      categoryUid,
      ceremonyUid,
      isWinner: 0,
    };
    console.log('  Added nomination to batch');
  }

  return {
    translations: translationsBatch,
    posterUrl: posterUrlData,
    nomination: nominationData,
  };
}
