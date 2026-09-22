import {setTimeout as sleep} from 'node:timers/promises';
import {
  insertMovieFromCsvRecord,
  insertMovieWithTranslations,
} from './insert-movie';
import {didCreateNomination} from './nomination';
import {fetchMovieByImdbId, searchMovieByTitle} from './tmdb-lookup';
import {
  type CsvMovieRow,
  type ImportRunContext,
  type TmdbMovieDetails,
} from './types';

export async function importNewRecord(
  context: ImportRunContext,
  record: CsvMovieRow,
  progress: {current: number; total: number},
): Promise<void> {
  const {tmdbApiKey, dryRun, throttleMs, stats} = context;
  const imdbId = record.Const.trim();
  const jaTitle = record.Title?.trim();
  const originalTitle = record['Original Title']?.trim();
  const csvYear = record.Year?.trim();
  const csvReleaseDate = record['Release Date']?.trim();
  const csvDescription = record.Description?.trim();

  console.log(
    `\n[${progress.current}/${progress.total}] IMDb ${imdbId}${
      jaTitle ? ` - ${jaTitle}` : ''
    }`,
  );

  let tmdbMovie: TmdbMovieDetails | undefined;
  try {
    tmdbMovie = await fetchMovieByImdbId(tmdbApiKey, imdbId);
    if (!tmdbMovie) {
      tmdbMovie = await searchMovieByTitle(tmdbApiKey, record);
    }
  } catch (error) {
    console.error('  Failed to fetch TMDb data:', error);
    stats.failed++;
    return;
  }

  if (!tmdbMovie) {
    stats.notFound++;
    if (dryRun) {
      console.log(
        '  [DRY RUN] Would insert movie using CSV metadata (no TMDb match).',
      );
      stats.imported++;
      stats.nominationsCreated++;
    } else {
      console.warn('  TMDb match not found. Using CSV metadata for insertion.');
      await insertFromCsv(context, imdbId, record);
    }
    if (throttleMs > 0) {
      await sleep(throttleMs);
    }
    return;
  }

  if (dryRun) {
    console.log(
      `  [DRY RUN] Would insert movie "${tmdbMovie.title}" (TMDb ${tmdbMovie.id ?? 'n/a'})`,
    );
    console.log(
      `  [DRY RUN] Would create nomination for ceremony ${context.awardContext.ceremonyUid}`,
    );
    stats.imported++;
    stats.nominationsCreated++;
  } else {
    await insertFromTmdb(context, imdbId, tmdbMovie, {
      jaTitle,
      originalTitle,
      csvYear,
      csvReleaseDate,
      csvDescription,
    });
  }

  if (throttleMs > 0) {
    await sleep(throttleMs);
  }
}

async function insertFromCsv(
  context: ImportRunContext,
  imdbId: string,
  record: CsvMovieRow,
): Promise<void> {
  const {database, tmdbConfig, stats, existingByImdbId} = context;
  try {
    const movieUid = await insertMovieFromCsvRecord({
      database,
      tmdbConfig,
      imdbId,
      record,
    });
    console.log(`  Inserted movie UID (CSV fallback): ${movieUid}`);
    stats.imported++;
    existingByImdbId.set(imdbId, {
      uid: movieUid,
      imdbId,
    });

    await ensureNominationForInserted(context, movieUid);
  } catch (error) {
    console.error('  Failed to insert movie from CSV metadata:', error);
    stats.failed++;
  }
}

async function insertFromTmdb(
  context: ImportRunContext,
  imdbId: string,
  tmdbMovie: TmdbMovieDetails,
  csv: {
    jaTitle?: string;
    originalTitle?: string;
    csvYear?: string;
    csvReleaseDate?: string;
    csvDescription?: string;
  },
): Promise<void> {
  const {database, tmdbConfig, stats, existingByImdbId} = context;
  try {
    const movieUid = await insertMovieWithTranslations({
      database,
      tmdbConfig,
      imdbId,
      tmdbMovie,
      ...csv,
    });
    console.log(`  Inserted movie UID: ${movieUid}`);
    stats.imported++;

    if (typeof tmdbMovie.id === 'number') {
      existingByImdbId.set(imdbId, {
        uid: movieUid,
        imdbId,
        tmdbId: tmdbMovie.id,
      });
    } else {
      existingByImdbId.set(imdbId, {
        uid: movieUid,
        imdbId,
      });
    }

    await ensureNominationForInserted(context, movieUid);
  } catch (error) {
    console.error('  Failed to import movie:', error);
    stats.failed++;
  }
}

async function ensureNominationForInserted(
  context: ImportRunContext,
  movieUid: string,
): Promise<void> {
  const {database, awardContext, dryRun, stats, nominatedMovieUids} = context;
  const nominationCreated = await didCreateNomination({
    database,
    movieUid,
    categoryUid: awardContext.categoryUid,
    ceremonyUid: awardContext.ceremonyUid,
    dryRun,
    skipLookup: true,
  });
  if (!nominationCreated) {
    return;
  }

  stats.nominationsCreated++;
  nominatedMovieUids.add(movieUid);
}
