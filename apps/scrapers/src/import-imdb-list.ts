import {readFileSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import {parse} from 'csv-parse/sync';
import {and, desc, eq, inArray, isNotNull} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {generateUUID} from '@shine/utils';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

type CsvMovieRow = {
  Const: string;
  Title?: string;
  'Original Title'?: string;
  Year?: string;
  'Release Date'?: string;
  Description?: string;
};

type TmdbConfiguration = {
  images: {
    secure_base_url: string;
    poster_sizes: string[];
  };
};

type TmdbMovieDetails = {
  id?: number;
  title: string;
  original_title: string;
  original_language?: string;
  release_date?: string;
  poster_path?: string;
  imdb_id?: string;
  overview?: string;
  localizedTitle?: string;
  localizedOverview?: string;
  media_type?: 'movie' | 'tv';
};

type TmdbMovieSearchResult = {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string;
  overview?: string;
};

type TmdbMultiSearchResult = {
  id: number;
  media_type: string;
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
};

type ImportStats = {
  skippedExisting: number;
  imported: number;
  notFound: number;
  failed: number;
  nominationsCreated: number;
};

type ImportOptions = {
  filePath: string;
  environment: Environment;
  dryRun?: boolean;
  limit?: number;
  throttleMs?: number;
};

let tmdbApiKey: string;
let tmdbConfiguration: TmdbConfiguration | undefined;
let releaseDateColumnAvailable: boolean | undefined;
const AWARD_ORGANIZATION_NAME = '1001 Movies You Must See Before You Die';
const AWARD_CATEGORY_NAME = 'Selected Films';

type AwardContext = {
  organizationUid: string;
  ceremonyUid: string;
  categoryUid: string;
};

let cachedAwardContext: AwardContext | undefined;

export async function importMoviesFromCsv({
  filePath,
  environment,
  dryRun = false,
  limit,
  throttleMs = 300,
}: ImportOptions): Promise<ImportStats> {
  tmdbApiKey = environment.TMDB_API_KEY ?? '';
  if (!tmdbApiKey) {
    throw new Error('TMDB_API_KEY is required to import movies from CSV.');
  }

  const fileContent = readFileSync(filePath, 'utf8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvMovieRow[];

  const uniqueRecords: CsvMovieRow[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const imdbId = record.Const?.trim();
    if (!imdbId || seen.has(imdbId)) {
      continue;
    }

    uniqueRecords.push(record);
    seen.add(imdbId);
  }

  const database = getDatabase(environment);
  const awardContext = await getAwardContext(database);
  const imdbIds = uniqueRecords.map(record => record.Const.trim());

  const existingMovies =
    imdbIds.length > 0
      ? await database
          .select({
            uid: movies.uid,
            imdbId: movies.imdbId,
            tmdbId: movies.tmdbId,
          })
          .from(movies)
          .where(and(isNotNull(movies.imdbId), inArray(movies.imdbId, imdbIds)))
      : [];

  const existingByImdbId = new Map<string, ExistingMovieRecord>();
  for (const movie of existingMovies) {
    if (!movie.imdbId) {
      continue;
    }

    if (typeof movie.tmdbId === 'number') {
      existingByImdbId.set(movie.imdbId, {
        uid: movie.uid,
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
      });
    } else {
      existingByImdbId.set(movie.imdbId, {
        uid: movie.uid,
        imdbId: movie.imdbId,
      });
    }
  }

  const existingRecords: CsvMovieRow[] = [];
  const newRecords: CsvMovieRow[] = [];
  for (const record of uniqueRecords) {
    const imdbId = record.Const.trim();
    if (existingByImdbId.has(imdbId)) {
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

  await ensureTmdbConfiguration();

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

    const nominationCreated = await ensureNomination({
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

  for (const record of targetNewRecords) {
    processedCount++;
    const imdbId = record.Const.trim();
    const jaTitle = record.Title?.trim();
    const originalTitle = record['Original Title']?.trim();
    const csvYear = record.Year?.trim();
    const csvReleaseDate = record['Release Date']?.trim();
    const csvDescription = record.Description?.trim();

    console.log(
      `\n[${processedCount}/${totalToProcess}] IMDb ${imdbId}${
        jaTitle ? ` - ${jaTitle}` : ''
      }`,
    );

    let tmdbMovie: TmdbMovieDetails | undefined;
    try {
      tmdbMovie = await fetchMovieByImdbId(imdbId);
      if (!tmdbMovie) {
        tmdbMovie = await searchMovieByTitle(record);
      }
    } catch (error) {
      console.error('  Failed to fetch TMDb data:', error);
      stats.failed++;
      continue;
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
        console.warn(
          '  TMDb match not found. Using CSV metadata for insertion.',
        );
        try {
          const movieUid = await insertMovieFromCsvRecord({
            database,
            imdbId,
            record,
          });
          console.log(`  Inserted movie UID (CSV fallback): ${movieUid}`);
          stats.imported++;
          existingByImdbId.set(imdbId, {
            uid: movieUid,
            imdbId,
          });

          const nominationCreated = await ensureNomination({
            database,
            movieUid,
            categoryUid: awardContext.categoryUid,
            ceremonyUid: awardContext.ceremonyUid,
            dryRun,
            skipLookup: true,
          });
          if (nominationCreated) {
            stats.nominationsCreated++;
            nominatedMovieUids.add(movieUid);
          }
        } catch (error) {
          console.error('  Failed to insert movie from CSV metadata:', error);
          stats.failed++;
        }
      }
      if (throttleMs > 0) {
        await sleep(throttleMs);
      }
      continue;
    }

    if (dryRun) {
      console.log(
        `  [DRY RUN] Would insert movie "${tmdbMovie.title}" (TMDb ${tmdbMovie.id ?? 'n/a'})`,
      );
      console.log(
        `  [DRY RUN] Would create nomination for ceremony ${awardContext.ceremonyUid}`,
      );
      stats.imported++;
      stats.nominationsCreated++;
    } else {
      try {
        const movieUid = await insertMovieWithTranslations({
          database,
          imdbId,
          tmdbMovie,
          jaTitle,
          originalTitle,
          csvYear,
          csvReleaseDate,
          csvDescription,
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

        const nominationCreated = await ensureNomination({
          database,
          movieUid,
          categoryUid: awardContext.categoryUid,
          ceremonyUid: awardContext.ceremonyUid,
          dryRun,
          skipLookup: true,
        });
        if (nominationCreated) {
          stats.nominationsCreated++;
          nominatedMovieUids.add(movieUid);
        }
      } catch (error) {
        console.error('  Failed to import movie:', error);
        stats.failed++;
      }
    }

    if (throttleMs > 0) {
      await sleep(throttleMs);
    }
  }

  console.log('\nImport summary:');
  console.log(`  Imported: ${stats.imported}`);
  console.log(`  Skipped (existing): ${stats.skippedExisting}`);
  console.log(`  Not found on TMDb: ${stats.notFound}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Nominations created: ${stats.nominationsCreated}`);

  return stats;
}

async function ensureTmdbConfiguration(): Promise<void> {
  if (tmdbConfiguration) {
    return;
  }

  const url = new URL(`${TMDB_API_BASE_URL}/configuration`);
  url.searchParams.set('api_key', tmdbApiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      `Failed to load TMDb configuration: ${response.statusText}`,
    );
  }

  tmdbConfiguration = (await response.json()) as TmdbConfiguration;
}

async function getAwardContext(
  database: ReturnType<typeof getDatabase>,
): Promise<AwardContext> {
  if (cachedAwardContext) {
    return cachedAwardContext;
  }

  const [organization] = await database
    .select({uid: awardOrganizations.uid})
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, AWARD_ORGANIZATION_NAME))
    .limit(1);

  if (!organization) {
    throw new Error(
      `Award organization "${AWARD_ORGANIZATION_NAME}" not found in database.`,
    );
  }

  const [category] = await database
    .select({uid: awardCategories.uid})
    .from(awardCategories)
    .where(
      and(
        eq(awardCategories.organizationUid, organization.uid),
        eq(awardCategories.name, AWARD_CATEGORY_NAME),
      ),
    )
    .limit(1);

  if (!category) {
    throw new Error(
      `Award category "${AWARD_CATEGORY_NAME}" not found for organization "${AWARD_ORGANIZATION_NAME}".`,
    );
  }

  const [ceremony] = await database
    .select({uid: awardCeremonies.uid})
    .from(awardCeremonies)
    .where(eq(awardCeremonies.organizationUid, organization.uid))
    .orderBy(desc(awardCeremonies.year))
    .limit(1);

  if (!ceremony) {
    throw new Error(
      `Award ceremony not found for organization "${AWARD_ORGANIZATION_NAME}".`,
    );
  }

  cachedAwardContext = {
    organizationUid: organization.uid,
    categoryUid: category.uid,
    ceremonyUid: ceremony.uid,
  };
  return cachedAwardContext;
}

async function fetchMovieByImdbId(
  imdbId: string,
): Promise<TmdbMovieDetails | undefined> {
  const findUrl = new URL(`${TMDB_API_BASE_URL}/find/${imdbId}`);
  findUrl.searchParams.set('api_key', tmdbApiKey);
  findUrl.searchParams.set('external_source', 'imdb_id');
  findUrl.searchParams.set('language', 'en-US');

  const response = await fetch(findUrl.toString());
  if (!response.ok) {
    throw new Error(`TMDb find endpoint error: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    movie_results?: TmdbMovieSearchResult[];
    tv_results?: TmdbMultiSearchResult[];
  };

  for (const baseMovie of data.movie_results ?? []) {
    const details = await fetchMovieDetails(baseMovie.id);
    if (details) {
      return details;
    }
  }

  for (const baseTv of data.tv_results ?? []) {
    const tvDetails = await fetchTvDetails(baseTv.id);
    if (tvDetails) {
      return {
        ...tvDetails,
        imdb_id: imdbId,
      };
    }
  }

  return undefined;
}

async function searchMovieByTitle(
  record: CsvMovieRow,
): Promise<TmdbMovieDetails | undefined> {
  const query = record['Original Title']?.trim() || record.Title?.trim();
  if (!query) {
    return undefined;
  }

  const year = record.Year?.trim();

  const searchUrl = new URL(`${TMDB_API_BASE_URL}/search/movie`);
  searchUrl.searchParams.set('api_key', tmdbApiKey);
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('include_adult', 'false');
  if (year) {
    searchUrl.searchParams.set('year', year);
  }

  const response = await fetch(searchUrl.toString());
  if (response.ok) {
    const data = (await response.json()) as {
      results: TmdbMovieSearchResult[];
    };
    for (const result of data.results ?? []) {
      const details = await fetchMovieDetails(result.id);
      if (details) {
        return details;
      }
    }
  }

  const multiUrl = new URL(`${TMDB_API_BASE_URL}/search/multi`);
  multiUrl.searchParams.set('api_key', tmdbApiKey);
  multiUrl.searchParams.set('query', query);
  multiUrl.searchParams.set('include_adult', 'false');
  if (year) {
    multiUrl.searchParams.set('first_air_date_year', year);
  }

  const multiResponse = await fetch(multiUrl.toString());
  if (multiResponse.ok) {
    const data = (await multiResponse.json()) as {
      results: TmdbMultiSearchResult[];
    };
    for (const result of data.results ?? []) {
      if (result.media_type === 'movie') {
        const details = await fetchMovieDetails(result.id);
        if (details) {
          return details;
        }
      }
      if (result.media_type === 'tv') {
        const details = await fetchTvDetails(result.id);
        if (details) {
          return details;
        }
      }
    }
  }

  return undefined;
}

async function fetchMovieDetails(
  tmdbId: number,
): Promise<TmdbMovieDetails | undefined> {
  const detailUrl = new URL(`${TMDB_API_BASE_URL}/movie/${tmdbId}`);
  detailUrl.searchParams.set('api_key', tmdbApiKey);
  detailUrl.searchParams.set('language', 'en-US');

  const response = await fetch(detailUrl.toString());
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`TMDb movie details error: ${response.statusText}`);
  }

  const details = (await response.json()) as TmdbMovieDetails;
  details.media_type = 'movie';

  // try to get Japanese localized fields separately (best-effort)
  const localizedUrl = new URL(`${TMDB_API_BASE_URL}/movie/${tmdbId}`);
  localizedUrl.searchParams.set('api_key', tmdbApiKey);
  localizedUrl.searchParams.set('language', 'ja');

  try {
    const localizedResponse = await fetch(localizedUrl.toString());
    if (localizedResponse.ok) {
      const localized = (await localizedResponse.json()) as TmdbMovieDetails;
      return {
        ...details,
        localizedTitle: localized.title,
        localizedOverview: localized.overview,
      };
    }
  } catch (error) {
    console.warn(`    Failed to fetch localized TMDb data: ${String(error)}`);
  }

  return details;
}

async function fetchTvDetails(
  tmdbId: number,
): Promise<TmdbMovieDetails | undefined> {
  const detailUrl = new URL(`${TMDB_API_BASE_URL}/tv/${tmdbId}`);
  detailUrl.searchParams.set('api_key', tmdbApiKey);
  detailUrl.searchParams.set('language', 'en-US');

  const response = await fetch(detailUrl.toString());
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`TMDb TV details error: ${response.statusText}`);
  }

  const details = (await response.json()) as {
    id: number;
    name: string;
    original_name?: string;
    overview?: string;
    poster_path?: string;
    first_air_date?: string;
    original_language?: string;
  };

  const tvDetails: TmdbMovieDetails = {
    id: details.id,
    title: details.name,
    original_title: details.original_name ?? details.name,
    original_language: details.original_language,
    release_date: details.first_air_date ?? undefined,
    poster_path: details.poster_path ?? undefined,
    overview: details.overview ?? '',
    media_type: 'tv',
  };

  const localizedUrl = new URL(`${TMDB_API_BASE_URL}/tv/${tmdbId}`);
  localizedUrl.searchParams.set('api_key', tmdbApiKey);
  localizedUrl.searchParams.set('language', 'ja');

  try {
    const localizedResponse = await fetch(localizedUrl.toString());
    if (localizedResponse.ok) {
      const localized = (await localizedResponse.json()) as {
        name?: string;
        overview?: string;
      };
      return {
        ...tvDetails,
        localizedTitle: localized.name,
        localizedOverview: localized.overview,
      };
    }
  } catch (error) {
    console.warn(
      `    Failed to fetch localized TMDb TV data: ${String(error)}`,
    );
  }

  return tvDetails;
}

type InsertMovieParameters = {
  database: ReturnType<typeof getDatabase>;
  imdbId: string;
  tmdbMovie: TmdbMovieDetails;
  jaTitle?: string;
  originalTitle?: string;
  csvYear?: string;
  csvReleaseDate?: string;
  csvDescription?: string;
};

type ExistingMovieRecord = {
  uid: string;
  imdbId: string;
  tmdbId?: number;
};

function toSqlArguments(
  values: Array<string | number | null | undefined>,
): Array<string | number | null> {
  return values.map(value => {
    if (value === undefined) {
      // eslint-disable-next-line unicorn/no-null
      return null;
    }
    return value;
  });
}

async function insertMovieWithTranslations({
  database,
  imdbId,
  tmdbMovie,
  jaTitle,
  originalTitle,
  csvYear,
  csvReleaseDate,
  csvDescription,
}: InsertMovieParameters): Promise<string> {
  const releaseYear =
    (tmdbMovie.release_date &&
      Number.parseInt(tmdbMovie.release_date.slice(0, 4), 10)) ||
    (csvYear ? Number.parseInt(csvYear, 10) : undefined);
  const normalizedYear =
    typeof releaseYear === 'number' && Number.isFinite(releaseYear)
      ? releaseYear
      : undefined;
  const releaseDate =
    (tmdbMovie.release_date && tmdbMovie.release_date.trim()) ||
    (csvReleaseDate && csvReleaseDate.trim()) ||
    undefined;

  const movieUid = generateUUID();
  const tmdbId = typeof tmdbMovie.id === 'number' ? tmdbMovie.id : undefined;

  const movieBaseValues: typeof movies.$inferInsert = {
    uid: movieUid,
    imdbId,
    originalLanguage: tmdbMovie.original_language ?? 'en',
    year: normalizedYear,
    ...(tmdbId === undefined ? {} : {tmdbId}),
  };

  const baseArguments = toSqlArguments([
    movieBaseValues.uid,
    movieBaseValues.originalLanguage,
    movieBaseValues.year,
    imdbId,
    tmdbId,
  ]);

  const isReleaseDateColumnAvailable = releaseDateColumnAvailable ?? true;
  const shouldIncludeReleaseDate =
    Boolean(releaseDate) && isReleaseDateColumnAvailable;

  if (shouldIncludeReleaseDate) {
    try {
      await database.$client.execute({
        sql: `
          INSERT INTO movies (
            uid, original_language, year, imdb_id, tmdb_id, release_date
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [...baseArguments, releaseDate!],
      });
      releaseDateColumnAvailable = true;
    } catch (error) {
      if (isMissingReleaseDateColumnError(error)) {
        releaseDateColumnAvailable = false;
        console.warn(
          "  WARN: 'release_date' column not found in movies table. Re-trying without release date.",
        );
        await database.$client.execute({
          sql: `
            INSERT INTO movies (uid, original_language, year, imdb_id, tmdb_id)
            VALUES (?, ?, ?, ?, ?)
          `,
          args: baseArguments,
        });
      } else {
        throw error;
      }
    }
  } else {
    await database.$client.execute({
      sql: `
        INSERT INTO movies (uid, original_language, year, imdb_id, tmdb_id)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: baseArguments,
    });
  }

  await insertTranslations({
    database,
    movieUid,
    tmdbMovie,
    jaTitle,
    originalTitle,
    csvDescription,
  });

  await insertReferenceUrls(
    database,
    movieUid,
    imdbId,
    tmdbId,
    tmdbMovie.media_type,
  );
  await insertPoster(database, movieUid, tmdbMovie.poster_path);

  return movieUid;
}

async function insertMovieFromCsvRecord({
  database,
  imdbId,
  record,
}: {
  database: ReturnType<typeof getDatabase>;
  imdbId: string;
  record: CsvMovieRow;
}): Promise<string> {
  const csvTitle = record.Title?.trim();
  const csvOriginalTitle = record['Original Title']?.trim();
  const csvDescription = record.Description?.trim();
  const csvReleaseDate = record['Release Date']?.trim();

  const fallbackMovie: TmdbMovieDetails = {
    title: csvTitle || csvOriginalTitle || `Untitled (${imdbId})`,
    original_title: csvOriginalTitle || csvTitle || `Untitled (${imdbId})`,
    release_date: csvReleaseDate || undefined,
    overview: csvDescription || '',
    imdb_id: imdbId,
    media_type: 'movie',
  };

  return insertMovieWithTranslations({
    database,
    imdbId,
    tmdbMovie: fallbackMovie,
    jaTitle: csvTitle,
    originalTitle: csvOriginalTitle,
    csvYear: record.Year?.trim(),
    csvReleaseDate,
    csvDescription,
  });
}

async function insertTranslations({
  database,
  movieUid,
  tmdbMovie,
  jaTitle,
  originalTitle,
  csvDescription,
}: {
  database: ReturnType<typeof getDatabase>;
  movieUid: string;
  tmdbMovie: TmdbMovieDetails;
  jaTitle?: string;
  originalTitle?: string;
  csvDescription?: string;
}) {
  const englishTitle =
    originalTitle || tmdbMovie.original_title || tmdbMovie.title;
  const japaneseTitle =
    jaTitle ||
    tmdbMovie.localizedTitle ||
    (tmdbMovie.title === englishTitle ? undefined : tmdbMovie.title);

  const values = [];

  if (englishTitle) {
    values.push({
      resourceType: 'movie_title',
      resourceUid: movieUid,
      languageCode: 'en',
      content: englishTitle,
      isDefault: 1,
    });
  }

  if (japaneseTitle) {
    values.push({
      resourceType: 'movie_title',
      resourceUid: movieUid,
      languageCode: 'ja',
      content: japaneseTitle,
      isDefault: 0,
    });
  }

  const englishOverview = tmdbMovie.overview?.trim() || csvDescription?.trim();
  if (englishOverview) {
    values.push({
      resourceType: 'movie_description',
      resourceUid: movieUid,
      languageCode: 'en',
      content: englishOverview,
      isDefault: 1,
    });
  }

  const japaneseOverview = tmdbMovie.localizedOverview?.trim();
  if (japaneseOverview) {
    values.push({
      resourceType: 'movie_description',
      resourceUid: movieUid,
      languageCode: 'ja',
      content: japaneseOverview,
      isDefault: 0,
    });
  }

  if (values.length === 0) {
    return;
  }

  await database.insert(translations).values(values).onConflictDoNothing();
}

async function insertReferenceUrls(
  database: ReturnType<typeof getDatabase>,
  movieUid: string,
  imdbId: string,
  tmdbId: number | undefined,
  mediaType: 'movie' | 'tv' | undefined,
) {
  const values: Array<typeof referenceUrls.$inferInsert> = [
    {
      movieUid,
      url: `https://www.imdb.com/title/${imdbId}/`,
      sourceType: 'imdb',
      languageCode: 'en',
      isPrimary: 1,
    },
  ];

  if (tmdbId) {
    const tmdbPath = mediaType === 'tv' ? 'tv' : 'movie';
    values.push({
      movieUid,
      url: `https://www.themoviedb.org/${tmdbPath}/${tmdbId}`,
      sourceType: 'other',
      languageCode: 'en',
      isPrimary: 0,
      description: 'TMDb entry',
    });
  }

  await database.insert(referenceUrls).values(values).onConflictDoNothing();
}

async function insertPoster(
  database: ReturnType<typeof getDatabase>,
  movieUid: string,
  posterPath?: string,
) {
  if (!posterPath || !tmdbConfiguration) {
    return;
  }

  const baseUrl = tmdbConfiguration.images.secure_base_url;
  const size = tmdbConfiguration.images.poster_sizes.includes('w500')
    ? 'w500'
    : 'original';

  await database
    .insert(posterUrls)
    .values({
      movieUid,
      url: `${baseUrl}${size}${posterPath}`,
      sourceType: 'tmdb',
      isPrimary: 1,
    })
    .onConflictDoNothing();
}

async function ensureNomination({
  database,
  movieUid,
  categoryUid,
  ceremonyUid,
  dryRun,
  skipLookup = false,
  verbose = true,
}: {
  database: ReturnType<typeof getDatabase>;
  movieUid: string;
  categoryUid: string;
  ceremonyUid: string;
  dryRun: boolean;
  skipLookup?: boolean;
  verbose?: boolean;
}): Promise<boolean> {
  if (!skipLookup) {
    const existing = await database
      .select({uid: nominations.uid})
      .from(nominations)
      .where(
        and(
          eq(nominations.movieUid, movieUid),
          eq(nominations.categoryUid, categoryUid),
          eq(nominations.ceremonyUid, ceremonyUid),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      if (verbose) {
        console.log('  Nomination already exists.');
      }
      return false;
    }
  }

  if (dryRun) {
    if (verbose) {
      console.log('  [DRY RUN] Would create nomination (Selected Films).');
    }
    return true;
  }

  await database
    .insert(nominations)
    .values({
      movieUid,
      categoryUid,
      ceremonyUid,
      isWinner: 0,
    })
    .onConflictDoNothing();
  if (verbose) {
    console.log('  Created nomination.');
  }
  return true;
}

function isMissingReleaseDateColumnError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.message}\n${String((error as {cause?: unknown}).cause ?? '')}`
      : String(error);
  return /(no such column|has no column named)\s*:?\s*release_date/i.test(
    message,
  );
}
