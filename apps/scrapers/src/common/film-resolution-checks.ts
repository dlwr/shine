import {setTimeout as sleep} from 'node:timers/promises';
import {findTMDBRecordsByImdbId} from '@shine/tmdb';
import type {ResolvedFilm} from './wikidata-film-resolver';

/** 対象年に対して許容する公開年のずれ */
export type YearWindow = {min: number; max: number};

export type FilmReference = {
  /** 解決結果を引くキー。通常はWikipediaの記事名 */
  key: string;
  title: string;
  /** 賞が対象とする年 */
  targetYear: number;
  yearWindow: YearWindow;
  /** 原語が日本語でない作品。TMDb検索の絞り込みに使う */
  foreign?: boolean;
};

export type ResolutionCandidate = {
  key: string;
  title: string;
  targetYear: number;
  yearWindow: YearWindow;
  imdbId: string;
  publicationYear?: number;
};

export type DuplicateResolution = {
  imdbId: string;
  entries: Array<{targetYear: number; title: string}>;
};

export function isPlausiblePublicationYear(
  publicationYear: number | undefined,
  targetYear: number,
  window: YearWindow,
): boolean {
  if (publicationYear === undefined) {
    return true;
  }

  const difference = publicationYear - targetYear;
  return difference >= window.min && difference <= window.max;
}

/** リメイクや続編の記事は最新版のIMDb IDを返すので、年の合わない解決結果を洗い出す */
export function collectImplausibleResolutions(
  references: FilmReference[],
  resolved: Map<string, ResolvedFilm>,
): ResolutionCandidate[] {
  const candidates: ResolutionCandidate[] = [];

  for (const reference of references) {
    const match = resolved.get(reference.key);
    if (
      !match ||
      (match.publicationYear !== undefined &&
        isPlausiblePublicationYear(
          match.publicationYear,
          reference.targetYear,
          reference.yearWindow,
        ))
    ) {
      continue;
    }

    candidates.push({
      key: reference.key,
      title: reference.title,
      targetYear: reference.targetYear,
      yearWindow: reference.yearWindow,
      imdbId: match.imdbId,
      publicationYear: match.publicationYear,
    });
  }

  return candidates;
}

/**
 * 連作は日本語版Wikipediaの記事が1本しかないので、第一部と第二部が
 * 同じIMDb IDに解決される。年の検証では検出できないので別に報告する
 */
export function collectDuplicateResolutions(
  references: FilmReference[],
  resolved: Map<string, ResolvedFilm>,
): DuplicateResolution[] {
  const byImdbId = new Map<
    string,
    Array<{targetYear: number; title: string}>
  >();

  for (const reference of references) {
    const match = resolved.get(reference.key);
    if (!match) {
      continue;
    }

    const entries = byImdbId.get(match.imdbId) ?? [];
    entries.push({targetYear: reference.targetYear, title: reference.title});
    byImdbId.set(match.imdbId, entries);
  }

  return [...byImdbId]
    .filter(
      ([, entries]) => new Set(entries.map(entry => entry.targetYear)).size > 1,
    )
    .map(([imdbId, entries]) => ({imdbId, entries}));
}

async function fetchTmdbReleaseYear(
  imdbId: string,
  tmdbApiKey: string,
): Promise<number | undefined> {
  try {
    const response = await findTMDBRecordsByImdbId(imdbId, tmdbApiKey);
    const year = response.movie_results?.[0]?.release_date?.slice(0, 4);
    return year ? Number(year) : undefined;
  } catch (error) {
    console.warn(`  TMDbの公開年を取得できません (${imdbId}):`, error);
    return undefined;
  }
}

/**
 * Wikidataの公開日には原作小説の出版年が入っていることがあるので、
 * 年が合わないものはTMDbの公開年で確かめてから捨てる
 */
export async function dropMisattributedResolutions({
  references,
  resolved,
  tmdbApiKey,
  throttleMs = 300,
  fetchReleaseYear,
}: {
  references: FilmReference[];
  resolved: Map<string, ResolvedFilm>;
  tmdbApiKey?: string;
  throttleMs?: number;
  fetchReleaseYear?: (imdbId: string) => Promise<number | undefined>;
}): Promise<number> {
  const candidates = collectImplausibleResolutions(references, resolved);
  if (candidates.length === 0) {
    return 0;
  }

  console.log(`Verifying ${candidates.length} resolutions with unlikely years`);

  const resolveYear =
    fetchReleaseYear ??
    (tmdbApiKey
      ? async (imdbId: string) => fetchTmdbReleaseYear(imdbId, tmdbApiKey)
      : undefined);

  let dropped = 0;
  for (const candidate of candidates) {
    const releaseYear = await resolveYear?.(candidate.imdbId);
    const label = `${candidate.title}（${candidate.targetYear}年, ${candidate.key}）-> ${candidate.imdbId}`;

    if (releaseYear === undefined) {
      console.warn(`  公開年を確認できないので残す: ${label}`);
      continue;
    }

    if (
      isPlausiblePublicationYear(
        releaseYear,
        candidate.targetYear,
        candidate.yearWindow,
      )
    ) {
      continue;
    }

    console.warn(`  別の作品と判断して除外: ${label}（TMDb ${releaseYear}年）`);
    resolved.delete(candidate.key);
    dropped++;

    if (throttleMs > 0) {
      await sleep(throttleMs);
    }
  }

  return dropped;
}

/**
 * 同じ賞で同じ映画が複数の年に選ばれることが無い賞では、
 * 重複した解決結果はどちらかが誤りなので両方捨てる
 */
export function dropDuplicateResolutions(
  references: FilmReference[],
  resolved: Map<string, ResolvedFilm>,
): number {
  const duplicates = collectDuplicateResolutions(references, resolved);
  const keys = new Set<string>();

  for (const duplicate of duplicates) {
    const where = duplicate.entries
      .map(entry => `${entry.targetYear}年「${entry.title}」`)
      .join('、');
    console.warn(
      `  複数の年が同じ映画を指すので除外: ${duplicate.imdbId} — ${where}`,
    );

    for (const reference of references) {
      if (resolved.get(reference.key)?.imdbId === duplicate.imdbId) {
        keys.add(reference.key);
      }
    }
  }

  for (const key of keys) {
    resolved.delete(key);
  }

  return keys.size;
}

export function reportDuplicateResolutions(
  references: FilmReference[],
  resolved: Map<string, ResolvedFilm>,
): void {
  for (const duplicate of collectDuplicateResolutions(references, resolved)) {
    const where = duplicate.entries
      .map(entry => `${entry.targetYear}年「${entry.title}」`)
      .join('、');
    console.warn(
      `  複数の年が同じ映画を指しています: ${duplicate.imdbId} — ${where}`,
    );
  }
}
