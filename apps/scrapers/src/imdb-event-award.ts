import {setTimeout as sleep} from 'node:timers/promises';
import {and, eq, inArray, isNotNull, isNull, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {withDefaultTranslationFlags} from './common/default-translations';
import {
  fetchTMDBConfig,
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
  /** 個人賞のとき、人物をどのクレジットから引き当てるか */
  personRole?: 'director' | 'actor';
  /** ノミネーションのnotesをspecialMentionとして保存する */
  useNotesAsSpecialMention?: boolean;
  winnerCorrections?: Array<{
    year: number;
    imdbId: string;
    isWinner: boolean;
  }>;
};

export type ImdbEventNominationTitle = {
  imdbId: string;
  title: string | null;
  originalTitle: string | null;
};

export type ImdbEventNominationPerson = {
  name: string;
};

export type ImdbEventNomination = {
  isWinner: boolean;
  notes: string | null;
  titles: ImdbEventNominationTitle[];
  /** 個人賞の受賞者・候補者。指定すると作品だけの行は作らない */
  people?: ImdbEventNominationPerson[];
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

export type AwardPerson = {
  name: string;
  isWinner: boolean;
};

export type AwardFilm = {
  imdbId: string;
  title: string | null;
  originalTitle: string | null;
  isWinner: boolean;
  specialMention?: string;
  people?: AwardPerson[];
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
  peopleUnresolved: number;
  failed: number;
};

function collectCategoryFilms(
  config: ImdbEventAwardConfig,
  category: ImdbEventCollectedData['editions'][number]['targetAward'][number]['categories'][number],
  filmsByImdbId: Map<string, AwardFilm>,
): void {
  if (!config.isCompetitionCategory(category.category)) {
    return;
  }

  for (const nomination of category.nominations) {
    collectNominationFilms(config, nomination, filmsByImdbId);
  }
}

function collectNominationFilms(
  config: ImdbEventAwardConfig,
  nomination: ImdbEventNomination,
  filmsByImdbId: Map<string, AwardFilm>,
): void {
  const nominated = nomination.people?.map(person => ({
    name: person.name,
    isWinner: nomination.isWinner,
  }));

  for (const title of nomination.titles) {
    const existing = filmsByImdbId.get(title.imdbId);
    if (existing) {
      existing.isWinner ||= nomination.isWinner;
      if (nominated) {
        existing.people = mergePeople(existing.people, nominated);
      }

      continue;
    }

    filmsByImdbId.set(title.imdbId, {
      imdbId: title.imdbId,
      title: title.title,
      originalTitle: title.originalTitle,
      isWinner: nomination.isWinner,
      specialMention:
        config.useNotesAsSpecialMention && nomination.notes
          ? nomination.notes
          : undefined,
      people: nominated,
    });
  }
}

function mergePeople(
  current: AwardPerson[] | undefined,
  incoming: AwardPerson[],
): AwardPerson[] {
  const merged = current ? [...current] : [];

  for (const person of incoming) {
    const existing = merged.find(entry => entry.name === person.name);
    if (existing) {
      existing.isWinner ||= person.isWinner;
    } else {
      merged.push({...person});
    }
  }

  return merged;
}

function applyWinnerCorrections(
  config: ImdbEventAwardConfig,
  year: number,
  filmsByImdbId: Map<string, AwardFilm>,
): void {
  const corrections = config.winnerCorrections ?? [];
  for (const correction of corrections) {
    if (correction.year !== year) {
      continue;
    }

    const film = filmsByImdbId.get(correction.imdbId);
    if (film) {
      film.isWinner = correction.isWinner;
    }
  }
}

export function extractAwardEditions(
  data: ImdbEventCollectedData,
  config: ImdbEventAwardConfig,
): AwardEdition[] {
  const editions: AwardEdition[] = [];

  for (const edition of data.editions) {
    const filmsByImdbId = new Map<string, AwardFilm>();

    for (const award of edition.targetAward) {
      for (const category of award.categories) {
        collectCategoryFilms(config, category, filmsByImdbId);
      }
    }

    applyWinnerCorrections(config, edition.year, filmsByImdbId);

    const films = filmsByImdbId.values().toArray();
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
    peopleUnresolved: 0,
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
  console.log(`  People unresolved: ${stats.peopleUnresolved}`);
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
    .select({
      movieUid: nominations.movieUid,
      isWinner: nominations.isWinner,
      specialMention: nominations.specialMention,
    })
    .from(nominations)
    .where(
      and(
        eq(nominations.ceremonyUid, ceremonyUid),
        eq(nominations.categoryUid, categoryUid),
        isNull(nominations.personUid),
      ),
    );
  const nominationsByMovieUid = new Map(
    existingNominations.map(row => [
      row.movieUid,
      {isWinner: row.isWinner, specialMention: row.specialMention},
    ]),
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

      await (film.people
        ? ensurePersonNominations(
            context,
            movieUid,
            ceremonyUid,
            categoryUid,
            film,
          )
        : ensureNomination(
            context,
            movieUid,
            ceremonyUid,
            categoryUid,
            film,
            nominationsByMovieUid,
          ));
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
    ? Number(details.release_date.slice(0, 4))
    : NaN;

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
    },
  ];

  const isJaFallbackToOriginal =
    detailsJa?.title === detailsJa?.original_title &&
    details?.original_language !== 'ja';
  const japaneseTitle = isJaFallbackToOriginal ? undefined : detailsJa?.title;
  if (japaneseTitle && japaneseTitle !== englishTitle) {
    translationValues.push({
      resourceType: 'movie_title',
      resourceUid: movie.uid,
      languageCode: 'ja',
      content: japaneseTitle,
    });
  }

  await database
    .insert(translations)
    .values(
      withDefaultTranslationFlags(
        details?.original_language ?? 'en',
        translationValues,
      ),
    )
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
  nominationsByMovieUid: Map<
    string,
    {isWinner: number; specialMention: string | null}
  >,
): Promise<void> {
  const {database, stats} = context;
  const existing = nominationsByMovieUid.get(movieUid);
  const winnerFlag = film.isWinner ? 1 : 0;

  if (existing === undefined) {
    await database
      .insert(nominations)
      .values({
        movieUid,
        ceremonyUid,
        categoryUid,
        isWinner: winnerFlag,
        specialMention: film.specialMention,
      })
      .onConflictDoNothing();
    nominationsByMovieUid.set(movieUid, {
      isWinner: winnerFlag,
      specialMention: film.specialMention ?? null, // eslint-disable-line unicorn/no-null -- DBのnullable列に合わせる
    });
    stats.nominationsCreated++;
    return;
  }

  const promoteWinner = film.isWinner && existing.isWinner === 0;
  const isUpdateMention =
    film.specialMention !== undefined &&
    film.specialMention !== existing.specialMention;

  if (!promoteWinner && !isUpdateMention) {
    return;
  }

  await database
    .update(nominations)
    .set({
      ...(promoteWinner && {isWinner: 1}),
      ...(isUpdateMention && {specialMention: film.specialMention}),
    })
    .where(
      and(
        eq(nominations.movieUid, movieUid),
        eq(nominations.ceremonyUid, ceremonyUid),
        eq(nominations.categoryUid, categoryUid),
        isNull(nominations.personUid),
      ),
    );

  nominationsByMovieUid.set(movieUid, {
    isWinner: promoteWinner ? 1 : existing.isWinner,
    specialMention: isUpdateMention
      ? (film.specialMention ?? null) // eslint-disable-line unicorn/no-null -- DBのnullable列に合わせる
      : existing.specialMention,
  });

  if (promoteWinner) {
    stats.winnersUpdated++;
  }
}

function normalizeName(name: string): string {
  return name.replaceAll(/\s+/gu, '').normalize('NFKC');
}

async function creditedPeople(
  database: DatabaseClient,
  movieUid: string,
  role: 'director' | 'actor',
): Promise<Map<string, string>> {
  const rows = await database
    .select({
      uid: people.uid,
      name: people.name,
      localizedName: translations.content,
    })
    .from(movieCredits)
    .innerJoin(people, eq(people.uid, movieCredits.personUid))
    .leftJoin(
      translations,
      and(
        eq(translations.resourceUid, people.uid),
        eq(translations.resourceType, 'person_name'),
        eq(translations.languageCode, 'ja'),
      ),
    )
    .where(
      and(
        eq(movieCredits.movieUid, movieUid),
        role === 'director'
          ? eq(movieCredits.job, 'Director')
          : eq(movieCredits.department, 'Acting'),
      ),
    );

  const byName = new Map<string, string>();
  for (const row of rows) {
    for (const name of [row.name, row.localizedName]) {
      if (name) {
        byName.set(normalizeName(name), row.uid);
      }
    }
  }

  return byName;
}

async function ensurePersonNominations(
  context: ImportContext,
  movieUid: string,
  ceremonyUid: string,
  categoryUid: string,
  film: AwardFilm,
): Promise<void> {
  const {database, config, stats} = context;
  const role = config.personRole ?? 'actor';
  const candidates = await creditedPeople(database, movieUid, role);

  const existing = await database
    .select({personUid: nominations.personUid, isWinner: nominations.isWinner})
    .from(nominations)
    .where(
      and(
        eq(nominations.movieUid, movieUid),
        eq(nominations.ceremonyUid, ceremonyUid),
        eq(nominations.categoryUid, categoryUid),
        isNotNull(nominations.personUid),
      ),
    );
  const winnerByPersonUid = new Map(
    existing.map(row => [row.personUid, row.isWinner]),
  );

  const nominees = film.people ?? [];
  for (const person of nominees) {
    const personUid = candidates.get(normalizeName(person.name));
    if (!personUid) {
      console.log(
        `  Unresolved person: ${person.name} (${film.title ?? film.imdbId})`,
      );
      stats.peopleUnresolved++;
      continue;
    }

    const winnerFlag = person.isWinner ? 1 : 0;
    const current = winnerByPersonUid.get(personUid);

    if (current === undefined) {
      await database
        .insert(nominations)
        .values({
          movieUid,
          ceremonyUid,
          categoryUid,
          personUid,
          isWinner: winnerFlag,
        })
        .onConflictDoNothing();
      winnerByPersonUid.set(personUid, winnerFlag);
      stats.nominationsCreated++;
      continue;
    }

    if (winnerFlag === 1 && current === 0) {
      await database
        .update(nominations)
        .set({isWinner: 1})
        .where(
          and(
            eq(nominations.movieUid, movieUid),
            eq(nominations.ceremonyUid, ceremonyUid),
            eq(nominations.categoryUid, categoryUid),
            eq(nominations.personUid, personUid),
          ),
        );
      winnerByPersonUid.set(personUid, 1);
      stats.winnersUpdated++;
    }
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
  let config;
  try {
    config = await fetchTMDBConfig(tmdbApiKey);
  } catch (error) {
    console.error('  Failed to fetch TMDb config:', error);
    return;
  }

  const size = config.images.poster_sizes.includes('w500')
    ? 'w500'
    : 'original';

  await database
    .insert(posterUrls)
    .values({
      movieUid,
      url: `${config.images.secure_base_url}${size}${posterPath}`,
      sourceType: 'tmdb',
      isPrimary: 1,
    })
    .onConflictDoNothing();
}
