import {and, eq} from 'drizzle-orm';
import {getDatabase} from '@shine/database';
import {nominations} from '@shine/database/schema/nominations';
import {fetchTMDBConfig} from './common/tmdb-client';
import {getAwardContext} from './import-imdb-list/award-context';
import {readUniqueCsvRecords} from './import-imdb-list/csv';
import {loadExistingMovies} from './import-imdb-list/existing-movies';
import {importNewRecord} from './import-imdb-list/import-new-record';
import {didCreateNomination} from './import-imdb-list/nomination';
import {
  type CsvMovieRow,
  type ImportOptions,
  type ImportRunContext,
  type ImportStats,
} from './import-imdb-list/types';

export async function importMoviesFromCsv({
  filePath,
  environment,
  dryRun = false,
  limit,
  throttleMs = 300,
  organizationName,
  categoryName,
  ceremonyName,
}: ImportOptions): Promise<ImportStats> {
  const tmdbApiKey = environment.TMDB_API_KEY ?? '';
  if (!tmdbApiKey) {
    throw new Error('TMDB_API_KEY is required to import movies from CSV.');
  }

  const uniqueRecords = readUniqueCsvRecords(filePath);

  const database = getDatabase(environment);
  const awardContext = await getAwardContext(database, {
    organizationName,
    categoryName,
    ceremonyName,
  });
  const imdbIds = uniqueRecords.map(record => record.Const.trim());
  const {existingByImdbId, softDeletedImdbIds} = await loadExistingMovies(
    database,
    imdbIds,
  );

  const existingRecords: CsvMovieRow[] = [];
  const newRecords: CsvMovieRow[] = [];
  for (const record of uniqueRecords) {
    const imdbId = record.Const.trim();
    if (softDeletedImdbIds.has(imdbId)) {
      console.log(`Skipping soft-deleted movie: ${imdbId}`);
    } else if (existingByImdbId.has(imdbId)) {
      existingRecords.push(record);
    } else {
      newRecords.push(record);
    }
  }

  const existingNominations = await database
    .select({movieUid: nominations.movieUid})
    .from(nominations)
    .where(
      and(
        eq(nominations.ceremonyUid, awardContext.ceremonyUid),
        eq(nominations.categoryUid, awardContext.categoryUid),
      ),
    );
  const nominatedMovieUids = new Set(
    existingNominations.map(item => item.movieUid),
  );

  const existingRecordsForNomination = existingRecords.filter(record => {
    const imdbId = record.Const.trim();
    const movie = existingByImdbId.get(imdbId);
    if (!movie) {
      return false;
    }
    return !nominatedMovieUids.has(movie.uid);
  });

  const targetNewRecords =
    typeof limit === 'number' && Number.isFinite(limit)
      ? newRecords.slice(0, limit)
      : newRecords;
  const totalToProcess =
    existingRecordsForNomination.length + targetNewRecords.length;

  const stats: ImportStats = {
    skippedExisting: 0,
    imported: 0,
    notFound: 0,
    failed: 0,
    nominationsCreated: 0,
  };

  const tmdbConfig = await fetchTMDBConfig(tmdbApiKey);

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Processing ${totalToProcess} movies from ${filePath} (${existingRecordsForNomination.length} existing needing nominations, ${targetNewRecords.length} new)`,
  );

  let processedCount = 0;
  let existingCreated = 0;

  if (existingRecordsForNomination.length > 0) {
    console.log(
      `\nEnsuring nominations for ${existingRecordsForNomination.length} existing movies...`,
    );
  }

  for (const record of existingRecordsForNomination) {
    processedCount++;
    const imdbId = record.Const.trim();
    const existing = existingByImdbId.get(imdbId);
    if (!existing) {
      continue;
    }

    const nominationCreated = await didCreateNomination({
      database,
      movieUid: existing.uid,
      categoryUid: awardContext.categoryUid,
      ceremonyUid: awardContext.ceremonyUid,
      dryRun,
      skipLookup: true,
      verbose: false,
    });
    if (nominationCreated) {
      existingCreated++;
      stats.nominationsCreated++;
      nominatedMovieUids.add(existing.uid);
    }
  }

  stats.skippedExisting += existingRecordsForNomination.length;

  if (existingRecordsForNomination.length > 0) {
    if (dryRun) {
      console.log(
        `  [DRY RUN] Would create ${existingRecordsForNomination.length} nominations for existing movies.`,
      );
    } else {
      console.log(
        `  Created ${existingCreated} nominations for existing movies.`,
      );
    }
  }

  const context: ImportRunContext = {
    database,
    tmdbApiKey,
    tmdbConfig,
    awardContext,
    dryRun,
    throttleMs,
    stats,
    existingByImdbId,
    nominatedMovieUids,
  };
  for (const record of targetNewRecords) {
    processedCount++;
    await importNewRecord(context, record, {
      current: processedCount,
      total: totalToProcess,
    });
  }

  console.log('\nImport summary:');
  console.log(`  Imported: ${stats.imported}`);
  console.log(`  Skipped (existing): ${stats.skippedExisting}`);
  console.log(`  Not found on TMDb: ${stats.notFound}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Nominations created: ${stats.nominationsCreated}`);

  return stats;
}
