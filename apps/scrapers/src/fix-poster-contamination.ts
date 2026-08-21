import {setTimeout as sleep} from 'node:timers/promises';
import {eq, inArray, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {fetchTMDBImages, findTMDBByImdbId} from './common/tmdb-utilities';

const TMDB_IMAGE_HOST = 'https://image.tmdb.org/';

export type PosterRow = {
  uid: string;
  url: string;
  languageCode: string | undefined;
  isPrimary: number;
};

export function posterFileName(url: string): string | undefined {
  if (!url.startsWith(TMDB_IMAGE_HOST)) {
    return undefined;
  }

  return url.split('/').pop();
}

export function partitionPosters(
  rows: PosterRow[],
  validPaths: Set<string>,
): {kept: PosterRow[]; foreign: PosterRow[]} {
  const kept: PosterRow[] = [];
  const foreign: PosterRow[] = [];

  for (const row of rows) {
    const fileName = posterFileName(row.url);
    if (fileName !== undefined && !validPaths.has(fileName)) {
      foreign.push(row);
    } else {
      kept.push(row);
    }
  }

  return {kept, foreign};
}

function languageRank(languageCode: string | undefined): number {
  if (languageCode === 'ja') {
    return 0;
  }

  if (languageCode === undefined) {
    return 1;
  }

  return 2;
}

export function choosePrimary(rows: PosterRow[]): PosterRow | undefined {
  let best: PosterRow | undefined;

  for (const row of rows) {
    if (
      !best ||
      languageRank(row.languageCode) < languageRank(best.languageCode) ||
      (languageRank(row.languageCode) === languageRank(best.languageCode) &&
        row.isPrimary > best.isPrimary)
    ) {
      best = row;
    }
  }

  return best;
}

export type FixPosterContaminationResult = {
  moviesScanned: number;
  moviesWithDeletions: number;
  postersDeleted: number;
  primariesFixed: number;
  unverified: number;
  zeroOverlap: Array<{movieUid: string; posters: number}>;
};

type FixContext = {
  database: ReturnType<typeof getDatabase>;
  environment: Environment;
  isDryRun: boolean;
};

type TargetMovie = {
  uid: string;
  imdbId: string | undefined;
  tmdbId: number | undefined;
};

async function defaultFetchValidPaths(
  movie: TargetMovie,
  environment: Environment,
): Promise<Set<string> | undefined> {
  const apiKey = environment.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY が設定されていません。');
  }

  let tmdbId = movie.tmdbId;
  let mediaType: 'movie' | 'tv' = 'movie';

  if (tmdbId === undefined) {
    if (movie.imdbId === undefined) {
      return undefined;
    }

    const found = await findTMDBByImdbId(movie.imdbId, apiKey);
    if (!found) {
      return undefined;
    }

    tmdbId = found.tmdbId;
    mediaType = found.mediaType;
  }

  const images = await fetchTMDBImages(tmdbId, mediaType, apiKey);
  if (!images?.posters || images.posters.length === 0) {
    return undefined;
  }

  return new Set(
    images.posters.map(poster => poster.file_path.replace('/', '')),
  );
}

export async function fixPosterContamination(
  context: FixContext,
  options: {
    movieUid?: string;
    limit?: number;
    throttleMs?: number;
    fetchValidPaths?: (movie: TargetMovie) => Promise<Set<string> | undefined>;
    onMovie?: (line: string) => void;
  } = {},
): Promise<FixPosterContaminationResult> {
  const {database, environment, isDryRun} = context;
  const throttleMs = options.throttleMs ?? 100;
  const fetchValidPaths =
    options.fetchValidPaths ??
    (movie => defaultFetchValidPaths(movie, environment));

  const targetsQuery = database
    .select({
      uid: movies.uid,
      imdbId: movies.imdbId,
      tmdbId: movies.tmdbId,
    })
    .from(movies)
    .where(
      sql`${movies.deletedAt} IS NULL AND EXISTS (SELECT 1 FROM ${posterUrls} WHERE ${posterUrls.movieUid} = ${movies.uid})`,
    )
    .orderBy(movies.uid);

  const allTargets = options.movieUid
    ? await database
        .select({
          uid: movies.uid,
          imdbId: movies.imdbId,
          tmdbId: movies.tmdbId,
        })
        .from(movies)
        .where(
          sql`${movies.uid} = ${options.movieUid} AND ${movies.deletedAt} IS NULL`,
        )
    : await targetsQuery;

  const targets = (
    options.limit === undefined
      ? allTargets
      : allTargets.slice(0, options.limit)
  ).map(row => ({
    uid: row.uid,
    imdbId: row.imdbId ?? undefined,
    tmdbId: row.tmdbId ?? undefined,
  }));

  const result: FixPosterContaminationResult = {
    moviesScanned: 0,
    moviesWithDeletions: 0,
    postersDeleted: 0,
    primariesFixed: 0,
    unverified: 0,
    zeroOverlap: [],
  };

  for (const movie of targets) {
    result.moviesScanned++;

    const posterRows = await database
      .select({
        uid: posterUrls.uid,
        url: posterUrls.url,
        languageCode: posterUrls.languageCode,
        isPrimary: posterUrls.isPrimary,
      })
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movie.uid));
    const rows: PosterRow[] = posterRows.map(row => ({
      uid: row.uid,
      url: row.url,
      languageCode: row.languageCode ?? undefined,
      isPrimary: row.isPrimary ?? 0,
    }));

    if (rows.length === 0) {
      continue;
    }

    const validPaths = await fetchValidPaths(movie);

    if (throttleMs > 0 && !options.fetchValidPaths) {
      await sleep(throttleMs);
    }

    if (validPaths === undefined) {
      result.unverified++;
      continue;
    }

    const {kept, foreign} = partitionPosters(rows, validPaths);

    if (kept.length === 0 && foreign.length > 0) {
      result.zeroOverlap.push({movieUid: movie.uid, posters: foreign.length});
      options.onMovie?.(
        `  SKIP ${movie.uid}: ${foreign.length}枚すべてがTMDbのセットに無い(エンティティ不一致の疑い)`,
      );
      continue;
    }

    if (foreign.length > 0) {
      result.moviesWithDeletions++;
      result.postersDeleted += foreign.length;
      options.onMovie?.(
        `  ${movie.uid}: ${foreign.length}/${rows.length}枚を削除${isDryRun ? ' (dry-run)' : ''}`,
      );

      if (!isDryRun) {
        await database.delete(posterUrls).where(
          inArray(
            posterUrls.uid,
            foreign.map(row => row.uid),
          ),
        );
      }
    }

    const keeper = choosePrimary(kept);
    if (!keeper) {
      continue;
    }

    const demote = kept.filter(
      row => row.isPrimary === 1 && row.uid !== keeper.uid,
    );
    const promote = keeper.isPrimary === 1 ? [] : [keeper];

    if (demote.length === 0 && promote.length === 0) {
      continue;
    }

    result.primariesFixed++;
    options.onMovie?.(
      `  ${movie.uid}: primaryを整理 (降格${demote.length}, 昇格${promote.length})${isDryRun ? ' (dry-run)' : ''}`,
    );

    if (!isDryRun) {
      if (demote.length > 0) {
        await database
          .update(posterUrls)
          .set({isPrimary: 0})
          .where(
            inArray(
              posterUrls.uid,
              demote.map(row => row.uid),
            ),
          );
      }

      if (promote.length > 0) {
        await database
          .update(posterUrls)
          .set({isPrimary: 1})
          .where(eq(posterUrls.uid, keeper.uid));
      }
    }
  }

  return result;
}
