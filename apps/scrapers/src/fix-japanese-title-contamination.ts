import {setTimeout as sleep} from 'node:timers/promises';
import {hasJapaneseText} from '@shine/availability';
import {and, eq, isNull} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {hasKana} from './common/japanese-text';
import {pickJapaneseTitle} from './common/tmdb-japanese-title';
import {
  fetchTMDBDetails,
  fetchTMDBMovieDetails,
  findTMDBByImdbId,
} from './common/tmdb-utilities';

export type TmdbTitleDetails = {
  title?: string | undefined;
  original_title?: string | undefined;
  original_language?: string | undefined;
};

export type KeepFlag = 'foreignScript' | 'kanjiEqualsOriginal';

export type TitleFixDecision =
  | {action: 'replace'; title: string}
  | {action: 'relocate'; languageCode: string}
  | {action: 'delete'}
  | {action: 'keep'; flag?: KeepFlag}
  | {action: 'unverified'};

const LATIN_LETTER = /[A-Za-zÀ-ɏ]/;
const LANGUAGE_CODE = /^[a-z]{2}$/;

export function isContaminationCandidate(
  content: string,
  originalLanguage: string,
): boolean {
  if (hasKana(content)) {
    return false;
  }

  return originalLanguage !== 'ja' || !hasJapaneseText(content);
}

export function decideJapaneseTitleFix(
  content: string,
  details: TmdbTitleDetails | undefined,
): TitleFixDecision {
  if (details === undefined) {
    return {action: 'unverified'};
  }

  const isJapanese = hasJapaneseText(content);
  const isEqualsOriginal =
    details.original_language !== 'ja' &&
    content.trim() === details.original_title?.trim();
  const isFallback = isEqualsOriginal || !isJapanese;

  const japaneseTitle = pickJapaneseTitle(details);
  if (
    isFallback &&
    japaneseTitle !== undefined &&
    japaneseTitle !== content &&
    hasJapaneseText(japaneseTitle)
  ) {
    return {action: 'replace', title: japaneseTitle};
  }

  if (isEqualsOriginal && !isJapanese) {
    const languageCode = details.original_language ?? '';
    return LANGUAGE_CODE.test(languageCode)
      ? {action: 'relocate', languageCode}
      : {action: 'delete'};
  }

  if (isEqualsOriginal) {
    return {action: 'keep', flag: 'kanjiEqualsOriginal'};
  }

  if (!isJapanese && !LATIN_LETTER.test(content)) {
    return {action: 'keep', flag: 'foreignScript'};
  }

  return {action: 'keep'};
}

export type FixJapaneseTitleContaminationResult = {
  scanned: number;
  deleted: number;
  relocated: number;
  replaced: number;
  kept: number;
  unverified: Array<{movieUid: string; content: string}>;
  keptForeignScript: Array<{movieUid: string; content: string}>;
  keptKanjiEqualsOriginal: Array<{movieUid: string; content: string}>;
};

type FixContext = {
  database: ReturnType<typeof getDatabase>;
  environment: Environment;
  isDryRun: boolean;
};

export type TargetMovie = {
  uid: string;
  imdbId: string | undefined;
  tmdbId: number | undefined;
};

async function defaultFetchDetails(
  movie: TargetMovie,
  environment: Environment,
): Promise<TmdbTitleDetails | undefined> {
  const apiKey = environment.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY が設定されていません。');
  }

  if (movie.tmdbId !== undefined) {
    return fetchTMDBMovieDetails(movie.tmdbId, apiKey, 'ja');
  }

  if (movie.imdbId === undefined) {
    return undefined;
  }

  const found = await findTMDBByImdbId(movie.imdbId, apiKey);
  if (!found) {
    return undefined;
  }

  return fetchTMDBDetails(found.tmdbId, found.mediaType, apiKey, 'ja');
}

export async function fixJapaneseTitleContamination(
  context: FixContext,
  options: {
    movieUid?: string;
    limit?: number;
    throttleMs?: number;
    fetchDetails?: (
      movie: TargetMovie,
    ) => Promise<TmdbTitleDetails | undefined>;
    onMovie?: (line: string) => void;
  } = {},
): Promise<FixJapaneseTitleContaminationResult> {
  const {database, environment} = context;
  const throttleMs = options.throttleMs ?? 100;
  const fetchDetails =
    options.fetchDetails ?? (movie => defaultFetchDetails(movie, environment));

  const rows = await database
    .select({
      translationUid: translations.uid,
      movieUid: movies.uid,
      imdbId: movies.imdbId,
      tmdbId: movies.tmdbId,
      originalLanguage: movies.originalLanguage,
      content: translations.content,
    })
    .from(translations)
    .innerJoin(movies, eq(movies.uid, translations.resourceUid))
    .where(
      and(
        eq(translations.resourceType, 'movie_title'),
        eq(translations.languageCode, 'ja'),
        isNull(movies.deletedAt),
        options.movieUid === undefined
          ? undefined
          : eq(movies.uid, options.movieUid),
      ),
    )
    .orderBy(movies.uid);

  const candidates = rows.filter(row =>
    isContaminationCandidate(row.content, row.originalLanguage),
  );
  const targets =
    options.limit === undefined
      ? candidates
      : candidates.slice(0, options.limit);

  const result: FixJapaneseTitleContaminationResult = {
    scanned: 0,
    deleted: 0,
    relocated: 0,
    replaced: 0,
    kept: 0,
    unverified: [],
    keptForeignScript: [],
    keptKanjiEqualsOriginal: [],
  };

  for (const [index, row] of targets.entries()) {
    result.scanned++;
    const details = await fetchDetails({
      uid: row.movieUid,
      imdbId: row.imdbId ?? undefined,
      tmdbId: row.tmdbId ?? undefined,
    });
    await applyDecision(
      context,
      options.onMovie,
      result,
      row,
      decideJapaneseTitleFix(row.content, details),
    );

    if (throttleMs > 0 && index + 1 < targets.length) {
      await sleep(throttleMs);
    }
  }

  return result;
}

type CandidateRow = {
  translationUid: string;
  movieUid: string;
  content: string;
};

async function hasTitleInLanguage(
  database: FixContext['database'],
  movieUid: string,
  languageCode: string,
): Promise<boolean> {
  const [row] = await database
    .select({uid: translations.uid})
    .from(translations)
    .where(
      and(
        eq(translations.resourceType, 'movie_title'),
        eq(translations.resourceUid, movieUid),
        eq(translations.languageCode, languageCode),
      ),
    )
    .limit(1);
  return row !== undefined;
}

async function deleteRow(
  context: FixContext,
  onMovie: ((line: string) => void) | undefined,
  result: FixJapaneseTitleContaminationResult,
  row: CandidateRow,
): Promise<void> {
  result.deleted++;
  onMovie?.(`${row.movieUid}: 削除 "${row.content}"`);
  if (!context.isDryRun) {
    await context.database
      .delete(translations)
      .where(eq(translations.uid, row.translationUid));
  }
}

async function applyDecision(
  context: FixContext,
  onMovie: ((line: string) => void) | undefined,
  result: FixJapaneseTitleContaminationResult,
  row: CandidateRow,
  decision: TitleFixDecision,
): Promise<void> {
  switch (decision.action) {
    case 'delete': {
      await deleteRow(context, onMovie, result, row);
      return;
    }

    case 'relocate': {
      if (
        await hasTitleInLanguage(
          context.database,
          row.movieUid,
          decision.languageCode,
        )
      ) {
        await deleteRow(context, onMovie, result, row);
        return;
      }

      result.relocated++;
      onMovie?.(
        `${row.movieUid}: ${decision.languageCode} へ移動 "${row.content}"`,
      );
      if (!context.isDryRun) {
        await context.database
          .update(translations)
          .set({languageCode: decision.languageCode})
          .where(eq(translations.uid, row.translationUid));
      }

      return;
    }

    case 'replace': {
      result.replaced++;
      onMovie?.(
        `${row.movieUid}: 置換 "${row.content}" -> "${decision.title}"`,
      );
      if (!context.isDryRun) {
        await context.database
          .update(translations)
          .set({content: decision.title})
          .where(eq(translations.uid, row.translationUid));
      }

      return;
    }

    case 'unverified': {
      result.unverified.push({movieUid: row.movieUid, content: row.content});
      onMovie?.(`${row.movieUid}: TMDb未確認 "${row.content}"`);
      return;
    }

    case 'keep': {
      result.kept++;
      if (decision.flag === 'foreignScript') {
        result.keptForeignScript.push({
          movieUid: row.movieUid,
          content: row.content,
        });
      } else if (decision.flag === 'kanjiEqualsOriginal') {
        result.keptKanjiEqualsOriginal.push({
          movieUid: row.movieUid,
          content: row.content,
        });
      }
    }
  }
}
