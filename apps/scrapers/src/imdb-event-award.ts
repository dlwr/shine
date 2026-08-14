import {setTimeout as sleep} from 'node:timers/promises';
import {and, eq, inArray, isNotNull, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {
  fetchTMDBConfiguration,
  fetchTMDBMovieDetails,
  findTMDBByImdbId,
  type TMDBMovieData,
} from './common/tmdb-utilities';

export type ImdbEventAwardConfig = {
  organizationName: string;
  organizationCountry: string;
  establishedYear: number;
  categoryName: string;
  ceremonyNumber: (year: number) => number | undefined;
  isCompetitionCategory: (category: string | null) => boolean;
  minimumFilmsPerEdition: number;
};

export type ImdbEventNominationTitle = {
  imdbId: string;
  title: string | null;
  originalTitle: string | null;
};

export type ImdbEventNomination = {
  isWinner: boolean;
  notes: string | null;
  titles: ImdbEventNominationTitle[];
};

export type ImdbEventEdition = {
  year: number;
  awardNames: string[];
  targetAward: Array<{
    categories: Array<{
      category: string | null;
      total: number | null;
      nominations: ImdbEventNomination[];
    }>;
  }>;
};

export type ImdbEventCollectedData = {
  collectedAt: string;
  source: string;
  editions: ImdbEventEdition[];
};

export type AwardFilm = {
  imdbId: string;
  title: string | null;
  originalTitle: string | null;
  isWinner: boolean;
};

export type AwardEdition = {
  year: number;
  films: AwardFilm[];
};

export type ImdbEventImportStats = {
  editionsProcessed: number;
  moviesCreated: number;
  moviesExisting: number;
  skippedSoftDeleted: number;
  nominationsCreated: number;
  winnersUpdated: number;
  tmdbNotFound: number;
  failed: number;
};

export function extractAwardEditions(
  data: ImdbEventCollectedData,
  config: ImdbEventAwardConfig,
): AwardEdition[] {
  const editions: AwardEdition[] = [];

  for (const edition of data.editions) {
    const filmsByImdbId = new Map<string, AwardFilm>();

    for (const award of edition.targetAward) {
      for (const category of award.categories) {
        if (!config.isCompetitionCategory(category.category)) {
          continue;
        }

        for (const nomination of category.nominations) {
          for (const title of nomination.titles) {
            const existing = filmsByImdbId.get(title.imdbId);
            if (existing) {
              existing.isWinner = existing.isWinner || nomination.isWinner;
              continue;
            }

            filmsByImdbId.set(title.imdbId, {
              imdbId: title.imdbId,
              title: title.title,
              originalTitle: title.originalTitle,
              isWinner: nomination.isWinner,
            });
          }
        }
      }
    }

    const films = [...filmsByImdbId.values()];
    if (films.length < config.minimumFilmsPerEdition) {
      continue;
    }

    editions.push({year: edition.year, films});
  }

  return editions;
}

type DatabaseClient = ReturnType<typeof getDatabase>;

type ImportContext = {
  database: DatabaseClient;
  config: ImdbEventAwardConfig;
  tmdbApiKey: string | undefined;
  throttleMs: number;
  stats: ImdbEventImportStats;
};

export async function importImdbEventAward({
  environment,
  data,
  config,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  data: ImdbEventCollectedData;
  config: ImdbEventAwardConfig;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const stats: ImdbEventImportStats = {
    editionsProcessed: 0,
    moviesCreated: 0,
    moviesExisting: 0,
    skippedSoftDeleted: 0,
    nominationsCreated: 0,
    winnersUpdated: 0,
    tmdbNotFound: 0,
    failed: 0,
  };

  const allEditions = extractAwardEditions(data, config);
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(edition => edition.year === year);

  if (editions.length === 0) {
    console.log('No editions to process.');
    return stats;
  }

  if (dryRun) {
    for (const edition of editions) {
      const winners = edition.films.filter(film => film.isWinner);
      console.log(
        `[DRY RUN] ${edition.year} (ceremony #${config.ceremonyNumber(edition.year) ?? '?'}): ${edition.films.length} films, winners: ${
          winners.map(film => film.originalTitle ?? film.title).join(', ') ||
          'none'
        }`,
      );
      stats.editionsProcessed++;
    }

    return stats;
  }

  const database = getDatabase(environment);
  const context: ImportContext = {
    database,
    config,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
    stats,
  };

  const organizationUid = await ensureOrganization(database, config);
  const categoryUid = await ensureCategory(database, organizationUid, config);

  for (const edition of editions) {
    console.log(`\nProcessing ${config.organizationName} ${edition.year}...`);
    const ceremonyUid = await ensureCeremony(
      database,
      organizationUid,
      edition.year,
      config,
    );
    await processEdition(context, edition, ceremonyUid, categoryUid);
    stats.editionsProcessed++;
  }

  console.log('\nImport summary:');
  console.log(`  Editions processed: ${stats.editionsProcessed}`);
  console.log(`  Movies created: ${stats.moviesCreated}`);
  console.log(`  Movies existing: ${stats.moviesExisting}`);
  console.log(`  Skipped (soft-deleted): ${stats.skippedSoftDeleted}`);
  console.log(`  Nominations created: ${stats.nominationsCreated}`);
  console.log(`  Winners updated: ${stats.winnersUpdated}`);
  console.log(`  TMDb not found: ${stats.tmdbNotFound}`);
  console.log(`  Failed: ${stats.failed}`);

  return stats;
}

async function ensureOrganization(
  database: DatabaseClient,
  config: ImdbEventAwardConfig,
): Promise<string> {
  await database
    .insert(awardOrganizations)
    .values({
      name: config.organizationName,
      country: config.organizationCountry,
      establishedYear: config.establishedYear,
    })
    .onConflictDoNothing();

  const [row] = await database
    .select({uid: awardOrganizations.uid})
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, config.organizationName))
    .limit(1);

  if (!row) {
    throw new Error(`Failed to create ${config.organizationName} organization`);
  }

  return row.uid;
}

async function ensureCategory(
  database: DatabaseClient,
  organizationUid: string,
  config: ImdbEventAwardConfig,
): Promise<string> {
  await database
    .insert(awardCategories)
    .values({
      organizationUid,
      name: config.categoryName,
      shortName: config.categoryName,
    })
    .onConflictDoNothing();

  const [row] = await database
    .select({uid: awardCategories.uid})
    .from(awardCategories)
    .where(
      and(
        eq(awardCategories.organizationUid, organizationUid),
        eq(awardCategories.name, config.categoryName),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(`Failed to create ${config.categoryName} category`);
  }

  return row.uid;
}

async function ensureCeremony(
  database: DatabaseClient,
  organizationUid: string,
  year: number,
  config: ImdbEventAwardConfig,
): Promise<string> {
  const ceremonyNumber = config.ceremonyNumber(year);
  const [row] = await database
    .insert(awardCeremonies)
    .values({organizationUid, year, ceremonyNumber})
    .onConflictDoUpdate({
      target: [awardCeremonies.organizationUid, awardCeremonies.year],
      set: {ceremonyNumber: ceremonyNumber ?? sql`NULL`},
    })
    .returning();

  return row.uid;
}

async function processEdition(
  context: ImportContext,
  edition: AwardEdition,
  ceremonyUid: string,
  categoryUid: string,
): Promise<void> {
  const {database, stats} = context;
  const imdbIds = edition.films.map(film => film.imdbId);

  const existingMovies = await database
    .select({
      uid: movies.uid,
      imdbId: movies.imdbId,
      deletedAt: movies.deletedAt,
    })
    .from(movies)
    .where(and(isNotNull(movies.imdbId), inArray(movies.imdbId, imdbIds)));

  const activeByImdbId = new Map<string, string>();
  const softDeletedImdbIds = new Set<string>();
  for (const movie of existingMovies) {
    if (!movie.imdbId) {
      continue;
    }

    if (movie.deletedAt === null) {
      activeByImdbId.set(movie.imdbId, movie.uid);
    } else {
      softDeletedImdbIds.add(movie.imdbId);
    }
  }

  const existingNominations = await database
    .select({movieUid: nominations.movieUid, isWinner: nominations.isWinner})
    .from(nominations)
    .where(
      and(
        eq(nominations.ceremonyUid, ceremonyUid),
        eq(nominations.categoryUid, categoryUid),
      ),
    );
  const nominationsByMovieUid = new Map(
    existingNominations.map(row => [row.movieUid, row.isWinner]),
  );

  for (const film of edition.films) {
    if (softDeletedImdbIds.has(film.imdbId)) {
      console.log(`  Skipping soft-deleted movie: ${film.imdbId}`);
      stats.skippedSoftDeleted++;
      continue;
    }

    try {
      let movieUid = activeByImdbId.get(film.imdbId);
      if (movieUid) {
        stats.moviesExisting++;
      } else {
        movieUid = await createMovie(context, film, edition.year);
        if (!movieUid) {
          continue;
        }
      }

      await ensureNomination(
        context,
        movieUid,
        ceremonyUid,
        categoryUid,
        film,
        nominationsByMovieUid,
      );
    } catch (error) {
      console.error(`  Failed to process ${film.imdbId}:`, error);
      stats.failed++;
    }
  }
}

async function createMovie(
  context: ImportContext,
  film: AwardFilm,
  editionYear: number,
): Promise<string | undefined> {
  const {database, tmdbApiKey, stats} = context;

  let details: TMDBMovieData | undefined;
  let detailsJa: TMDBMovieData | undefined;
  if (tmdbApiKey) {
    const found = await findTMDBByImdbId(film.imdbId, tmdbApiKey);
    if (found?.mediaType === 'movie') {
      details = await fetchTMDBMovieDetails(found.tmdbId, tmdbApiKey, 'en-US');
      detailsJa = await fetchTMDBMovieDetails(found.tmdbId, tmdbApiKey, 'ja');
    }

    if (!details) {
      stats.tmdbNotFound++;
    }

    if (context.throttleMs > 0) {
      await sleep(context.throttleMs);
    }
  }

  if (details) {
    const reused = await reuseMovieByTmdbId(context, film, details.id);
    if (reused !== undefined) {
      return reused === 'soft-deleted' ? undefined : reused;
    }
  }

  const englishTitle = details?.title || film.originalTitle || film.title;
  if (!englishTitle) {
    console.log(`  Skipping ${film.imdbId}: no usable title`);
    stats.failed++;
    return undefined;
  }

  const releaseYear = details?.release_date
    ? Number.parseInt(details.release_date.slice(0, 4), 10)
    : Number.NaN;

  const [movie] = await database
    .insert(movies)
    .values({
      imdbId: film.imdbId,
      tmdbId: details?.id,
      originalLanguage: details?.original_language ?? 'en',
      year: Number.isFinite(releaseYear) ? releaseYear : editionYear,
      releaseDate: details?.release_date || undefined,
    })
    .returning();

  const translationValues: Array<typeof translations.$inferInsert> = [
    {
      resourceType: 'movie_title',
      resourceUid: movie.uid,
      languageCode: 'en',
      content: englishTitle,
      isDefault: 1,
    },
  ];

  const japaneseTitle = detailsJa?.title;
  if (japaneseTitle && japaneseTitle !== englishTitle) {
    translationValues.push({
      resourceType: 'movie_title',
      resourceUid: movie.uid,
      languageCode: 'ja',
      content: japaneseTitle,
      isDefault: 0,
    });
  }

  await database
    .insert(translations)
    .values(translationValues)
    .onConflictDoNothing();

  await insertReferenceUrls(database, movie.uid, film.imdbId, details?.id);

  if (details?.poster_path && context.tmdbApiKey) {
    await insertPoster(
      database,
      movie.uid,
      details.poster_path,
      context.tmdbApiKey,
    );
  }

  console.log(
    `  Created movie: ${englishTitle} (${film.imdbId}${details ? `, TMDb ${details.id}` : ''})`,
  );
  stats.moviesCreated++;
  return movie.uid;
}

async function reuseMovieByTmdbId(
  context: ImportContext,
  film: AwardFilm,
  tmdbId: number,
): Promise<string | 'soft-deleted' | undefined> {
  const {database, stats} = context;
  const [existing] = await database
    .select({
      uid: movies.uid,
      imdbId: movies.imdbId,
      deletedAt: movies.deletedAt,
    })
    .from(movies)
    .where(eq(movies.tmdbId, tmdbId))
    .limit(1);

  if (!existing) {
    return undefined;
  }

  if (existing.deletedAt !== null) {
    console.log(
      `  Skipping soft-deleted movie (TMDb ${tmdbId}): ${film.imdbId}`,
    );
    stats.skippedSoftDeleted++;
    return 'soft-deleted';
  }

  if (!existing.imdbId) {
    await database
      .update(movies)
      .set({imdbId: film.imdbId})
      .where(eq(movies.uid, existing.uid));
    console.log(`  Set IMDb ID on existing movie (TMDb ${tmdbId})`);
  }

  stats.moviesExisting++;
  return existing.uid;
}

async function ensureNomination(
  context: ImportContext,
  movieUid: string,
  ceremonyUid: string,
  categoryUid: string,
  film: AwardFilm,
  nominationsByMovieUid: Map<string, number>,
): Promise<void> {
  const {database, stats} = context;
  const existingIsWinner = nominationsByMovieUid.get(movieUid);

  if (existingIsWinner === undefined) {
    await database
      .insert(nominations)
      .values({
        movieUid,
        ceremonyUid,
        categoryUid,
        isWinner: film.isWinner ? 1 : 0,
      })
      .onConflictDoNothing();
    nominationsByMovieUid.set(movieUid, film.isWinner ? 1 : 0);
    stats.nominationsCreated++;
    return;
  }

  if (film.isWinner && existingIsWinner === 0) {
    await database
      .update(nominations)
      .set({isWinner: 1})
      .where(
        and(
          eq(nominations.movieUid, movieUid),
          eq(nominations.ceremonyUid, ceremonyUid),
          eq(nominations.categoryUid, categoryUid),
        ),
      );
    nominationsByMovieUid.set(movieUid, 1);
    stats.winnersUpdated++;
  }
}

async function insertReferenceUrls(
  database: DatabaseClient,
  movieUid: string,
  imdbId: string,
  tmdbId: number | undefined,
): Promise<void> {
  const values: Array<typeof referenceUrls.$inferInsert> = [
    {
      movieUid,
      url: `https://www.imdb.com/title/${imdbId}/`,
      sourceType: 'imdb',
      languageCode: 'en',
      isPrimary: 1,
    },
  ];

  if (tmdbId !== undefined) {
    values.push({
      movieUid,
      url: `https://www.themoviedb.org/movie/${tmdbId}`,
      sourceType: 'other',
      languageCode: 'en',
      isPrimary: 0,
      description: 'TMDb entry',
    });
  }

  await database.insert(referenceUrls).values(values).onConflictDoNothing();
}

async function insertPoster(
  database: DatabaseClient,
  movieUid: string,
  posterPath: string,
  tmdbApiKey: string,
): Promise<void> {
  let configuration;
  try {
    configuration = await fetchTMDBConfiguration(tmdbApiKey);
  } catch (error) {
    console.error('  Failed to fetch TMDb configuration:', error);
    return;
  }

  const size = configuration.images.poster_sizes.includes('w500')
    ? 'w500'
    : 'original';

  await database
    .insert(posterUrls)
    .values({
      movieUid,
      url: `${configuration.images.secure_base_url}${size}${posterPath}`,
      sourceType: 'tmdb',
      isPrimary: 1,
    })
    .onConflictDoNothing();
}
