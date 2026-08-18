import {and, eq, isNull} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {
  fetchTMDBImages,
  fetchTMDBMovieDetails,
  findTMDBByImdbId,
  savePosterUrls,
  type TMDBMovieData,
} from './common/tmdb-utilities';

export type MisattributedNomination = {
  organization: string;
  category: string;
  ceremonyYear: number;
  specialMention?: string | undefined;
  wrongImdbId: string;
  correctImdbId: string | undefined;
  correctTitle: string;
  correctYear: number;
};

export type FixMisattributedStats = {
  repointed: number;
  deletedDuplicate: number;
  moviesCreated: number;
  moviesRevived: number;
  skipped: number;
  failed: number;
  affectedMovieUids: string[];
};

type Database = ReturnType<typeof getDatabase>;

const CJK_PATTERN = /[぀-ヿ一-鿿]/;

type FixOptions = {
  environment: Environment;
  entries: MisattributedNomination[];
  dryRun?: boolean;
  throttleMs?: number;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

async function findTargetNomination(
  database: Database,
  entry: MisattributedNomination,
): Promise<{uid: string; movieUid: string} | undefined> {
  const rows = await database
    .select({uid: nominations.uid, movieUid: nominations.movieUid})
    .from(nominations)
    .innerJoin(movies, eq(movies.uid, nominations.movieUid))
    .innerJoin(
      awardCeremonies,
      eq(awardCeremonies.uid, nominations.ceremonyUid),
    )
    .innerJoin(
      awardOrganizations,
      eq(awardOrganizations.uid, awardCeremonies.organizationUid),
    )
    .innerJoin(
      awardCategories,
      eq(awardCategories.uid, nominations.categoryUid),
    )
    .where(
      and(
        eq(movies.imdbId, entry.wrongImdbId),
        eq(awardCeremonies.year, entry.ceremonyYear),
        eq(awardOrganizations.name, entry.organization),
        eq(awardCategories.name, entry.category),
        entry.specialMention
          ? eq(nominations.specialMention, entry.specialMention)
          : undefined,
      ),
    );

  if (rows.length > 1) {
    throw new Error(
      `${entry.organization} ${entry.ceremonyYear} ${entry.wrongImdbId} に一致するノミネーションが${rows.length}件あります`,
    );
  }

  return rows[0];
}

async function findMovieByImdbId(
  database: Database,
  imdbId: string,
): Promise<{uid: string; deletedAt: number | null} | undefined> {
  const [row] = await database
    .select({uid: movies.uid, deletedAt: movies.deletedAt})
    .from(movies)
    .where(eq(movies.imdbId, imdbId));
  return row;
}

async function findMovieByTitleAndYear(
  database: Database,
  title: string,
  year: number,
): Promise<string | undefined> {
  const [row] = await database
    .select({uid: movies.uid})
    .from(movies)
    .innerJoin(translations, eq(translations.resourceUid, movies.uid))
    .where(
      and(
        isNull(movies.deletedAt),
        eq(movies.year, year),
        eq(translations.resourceType, 'movie_title'),
        eq(translations.content, title),
      ),
    );
  return row?.uid;
}

async function createMovie(
  database: Database,
  environment: Environment,
  entry: MisattributedNomination,
  details: TMDBMovieData | undefined,
): Promise<string> {
  const [movie] = await database
    .insert(movies)
    .values({
      imdbId: entry.correctImdbId,
      tmdbId: details?.id,
      originalLanguage: details?.original_language ?? 'ja',
      year: entry.correctYear,
      releaseDate: details?.release_date || undefined,
    })
    .returning();

  const titleValues: Array<typeof translations.$inferInsert> = [
    {
      resourceType: 'movie_title',
      resourceUid: movie.uid,
      languageCode: 'en',
      content: details?.title ?? entry.correctTitle,
      isDefault: 1,
    },
  ];

  if (CJK_PATTERN.test(entry.correctTitle)) {
    titleValues.push({
      resourceType: 'movie_title',
      resourceUid: movie.uid,
      languageCode: 'ja',
      content: entry.correctTitle,
      isDefault: 0,
    });
  }

  await database.insert(translations).values(titleValues).onConflictDoNothing();

  if (entry.correctImdbId) {
    await database
      .insert(referenceUrls)
      .values({
        movieUid: movie.uid,
        url: `https://www.imdb.com/title/${entry.correctImdbId}/`,
        sourceType: 'imdb',
        languageCode: 'en',
        isPrimary: 1,
      })
      .onConflictDoNothing();
  }

  if (details?.id) {
    await database
      .insert(referenceUrls)
      .values({
        movieUid: movie.uid,
        url: `https://www.themoviedb.org/movie/${details.id}`,
        sourceType: 'other',
        languageCode: 'en',
        description: 'TMDb entry',
        isPrimary: 0,
      })
      .onConflictDoNothing();
  }

  if (details?.id && environment.TMDB_API_KEY) {
    const images = await fetchTMDBImages(
      details.id,
      'movie',
      environment.TMDB_API_KEY,
    );

    if (images) {
      await savePosterUrls(movie.uid, images.posters, environment);
    }
  }

  return movie.uid;
}

async function resolveCorrectMovie(
  database: Database,
  environment: Environment,
  entry: MisattributedNomination,
  stats: FixMisattributedStats,
): Promise<string> {
  if (entry.correctImdbId) {
    const existing = await findMovieByImdbId(database, entry.correctImdbId);

    if (existing) {
      if (existing.deletedAt !== null) {
        await database
          .update(movies)
          // eslint-disable-next-line unicorn/no-null -- 論理削除の解除はnullで表す
          .set({deletedAt: null})
          .where(eq(movies.uid, existing.uid));
        stats.moviesRevived++;
      }

      return existing.uid;
    }
  } else {
    const existing = await findMovieByTitleAndYear(
      database,
      entry.correctTitle,
      entry.correctYear,
    );

    if (existing) {
      return existing;
    }
  }

  const tmdbApiKey = environment.TMDB_API_KEY;
  let details: TMDBMovieData | undefined;
  if (entry.correctImdbId && tmdbApiKey) {
    const found = await findTMDBByImdbId(entry.correctImdbId, tmdbApiKey);
    if (found?.mediaType === 'movie') {
      details = await fetchTMDBMovieDetails(found.tmdbId, tmdbApiKey, 'en-US');
    }
  }

  const uid = await createMovie(database, environment, entry, details);
  stats.moviesCreated++;
  return uid;
}

async function hasSameNomination(
  database: Database,
  nominationUid: string,
  movieUid: string,
): Promise<boolean> {
  const [target] = await database
    .select({
      ceremonyUid: nominations.ceremonyUid,
      categoryUid: nominations.categoryUid,
    })
    .from(nominations)
    .where(eq(nominations.uid, nominationUid));

  const rows = await database
    .select({uid: nominations.uid})
    .from(nominations)
    .where(
      and(
        eq(nominations.movieUid, movieUid),
        eq(nominations.ceremonyUid, target.ceremonyUid),
        eq(nominations.categoryUid, target.categoryUid),
      ),
    );

  return rows.length > 0;
}

export async function fixMisattributedNominations({
  environment,
  entries,
  dryRun = false,
  throttleMs = 0,
}: FixOptions): Promise<FixMisattributedStats> {
  const database = getDatabase(environment);
  const stats: FixMisattributedStats = {
    repointed: 0,
    deletedDuplicate: 0,
    moviesCreated: 0,
    moviesRevived: 0,
    skipped: 0,
    failed: 0,
    affectedMovieUids: [],
  };
  const affected = new Set<string>();

  for (const entry of entries) {
    const label = `${entry.organization} ${entry.ceremonyYear}${
      entry.specialMention ? ` ${entry.specialMention}` : ''
    } ${entry.correctTitle}`;

    try {
      const nomination = await findTargetNomination(database, entry);

      if (!nomination) {
        console.log(`  対象なし（修正済み）: ${label}`);
        stats.skipped++;
        continue;
      }

      if (dryRun) {
        console.log(
          `  [dry-run] ${label}: ${entry.wrongImdbId} → ${entry.correctImdbId ?? '(IMDb ID無し)'}`,
        );
        stats.repointed++;
        continue;
      }

      const correctMovieUid = await resolveCorrectMovie(
        database,
        environment,
        entry,
        stats,
      );

      if (await hasSameNomination(database, nomination.uid, correctMovieUid)) {
        await database
          .delete(nominations)
          .where(eq(nominations.uid, nomination.uid));
        stats.deletedDuplicate++;
        console.log(`  重複のため削除: ${label}`);
      } else {
        await database
          .update(nominations)
          .set({movieUid: correctMovieUid})
          .where(eq(nominations.uid, nomination.uid));
        stats.repointed++;
        console.log(`  付け替え: ${label}`);
      }

      affected.add(nomination.movieUid);
      affected.add(correctMovieUid);

      if (throttleMs > 0) {
        await sleep(throttleMs);
      }
    } catch (error) {
      console.error(`  失敗: ${label}`, error);
      stats.failed++;
    }
  }

  stats.affectedMovieUids = [...affected];
  return stats;
}
