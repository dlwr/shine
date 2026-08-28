import {setTimeout as sleep} from 'node:timers/promises';
import {buildUrl, fetchJsonWithRetry} from './fetch-utilities';

const TMDB_API = 'https://api.themoviedb.org/3';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';
const BATCH_SIZE = 50;
/** claims を含む応答は1件で数百KBになるので、まとめすぎるとタイムアウトする */
const WIKIDATA_BATCH_SIZE = 10;
const WIKIDATA_TIMEOUT_MS = 60_000;
const IMDB_ID_PATTERN = /^tt\d+$/;

export type ResolvedFilm = {
  imdbId: string;
  englishTitle?: string;
  publicationYear?: number;
};

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

type WikipediaPagePropertiesResponse = {
  query?: {
    normalized?: Array<{from: string; to: string}>;
    redirects?: Array<{from: string; to: string}>;
    pages?: Record<
      string,
      {title?: string; pageprops?: {wikibase_item?: string}}
    >;
  };
};

type WikidataClaims = Record<
  string,
  Array<{mainsnak?: {datavalue?: {value?: unknown}}}>
>;

type WikidataEntitiesResponse = {
  entities?: Record<
    string,
    {
      claims?: WikidataClaims;
      labels?: Record<string, {value?: string}>;
    }
  >;
};

type TmdbFindResponse = {movie_results?: Array<{release_date?: string}>};

export type WikipediaLanguage = 'ja' | 'en';

function wikipediaApi(language: WikipediaLanguage): string {
  return `https://${language}.wikipedia.org/w/api.php`;
}

async function fetchWikibaseItems(
  pages: string[],
  language: WikipediaLanguage,
): Promise<Map<string, string>> {
  const url = buildUrl(wikipediaApi(language), {
    action: 'query',
    prop: 'pageprops',
    ppprop: 'wikibase_item',
    redirects: '1',
    format: 'json',
    titles: pages.join('|'),
  });

  const response = await fetchJsonWithRetry<WikipediaPagePropertiesResponse>(
    url,
    {
      headers: {'User-Agent': USER_AGENT},
    },
  );

  const normalized = new Map(
    (response.query?.normalized ?? []).map(entry => [entry.from, entry.to]),
  );
  const redirects = new Map(
    (response.query?.redirects ?? []).map(entry => [entry.from, entry.to]),
  );
  const byTitle = new Map(
    Object.values(response.query?.pages ?? {}).map(page => [page.title, page]),
  );

  const items = new Map<string, string>();
  for (const page of pages) {
    const title = normalized.get(page) ?? page;
    const resolvedTitle = redirects.get(title) ?? title;
    const item = byTitle.get(resolvedTitle)?.pageprops?.wikibase_item;
    if (item) {
      items.set(page, item);
    }
  }

  return items;
}

async function fetchImdbIds(
  itemIds: string[],
): Promise<Map<string, ResolvedFilm>> {
  const url = buildUrl(WIKIDATA_API, {
    action: 'wbgetentities',
    props: 'claims|labels',
    languages: 'en',
    format: 'json',
    ids: itemIds.join('|'),
  });

  const response = await fetchJsonWithRetry<WikidataEntitiesResponse>(
    url,
    {headers: {'User-Agent': USER_AGENT}},
    3,
    1000,
    WIKIDATA_TIMEOUT_MS,
  );

  const films = new Map<string, ResolvedFilm>();
  const entityEntries = Object.entries(response.entities ?? {});
  for (const [itemId, entity] of entityEntries) {
    const imdbId = entity.claims?.P345?.[0]?.mainsnak?.datavalue?.value;
    if (typeof imdbId !== 'string' || !IMDB_ID_PATTERN.test(imdbId)) {
      continue;
    }

    films.set(itemId, {
      imdbId,
      englishTitle: entity.labels?.en?.value,
      publicationYear: publicationYearFromClaims(entity.claims),
    });
  }

  return films;
}

/** WikidataのP577（publication date）から最も早い公開年を取り出す */
export function publicationYearFromClaims(
  claims: WikidataClaims | undefined,
): number | undefined {
  const years = (claims?.P577 ?? [])
    .map(claim => {
      const value = claim.mainsnak?.datavalue?.value;
      if (typeof value !== 'object' || value === null || !('time' in value)) {
        return;
      }

      const {time} = value as {time?: unknown};
      if (typeof time !== 'string') {
        return;
      }

      const year = /^\+(\d{4})/.exec(time)?.[1];
      return year === undefined ? undefined : Number(year);
    })
    .filter((year): year is number => year !== undefined);

  return years.length > 0 ? Math.min(...years) : undefined;
}

export async function resolveFilmsByWikipediaPage(
  pages: string[],
  {language = 'ja'}: {language?: WikipediaLanguage} = {},
): Promise<Map<string, ResolvedFilm>> {
  const itemsByPage = new Map<string, string>();
  for (let index = 0; index < pages.length; index += BATCH_SIZE) {
    const batch = pages.slice(index, index + BATCH_SIZE);
    const wikibaseItems = await fetchWikibaseItems(batch, language);
    for (const [page, item] of wikibaseItems) {
      itemsByPage.set(page, item);
    }

    console.log(
      `  Wikipedia: ${Math.min(index + BATCH_SIZE, pages.length)}/${pages.length}`,
    );
  }

  const itemIds = [...new Set(itemsByPage.values())];
  const filmsByItem = new Map<string, ResolvedFilm>();
  for (let index = 0; index < itemIds.length; index += WIKIDATA_BATCH_SIZE) {
    const batch = itemIds.slice(index, index + WIKIDATA_BATCH_SIZE);
    const imdbIds = await fetchImdbIds(batch);
    for (const [item, film] of imdbIds) {
      filmsByItem.set(item, film);
    }

    console.log(
      `  Wikidata: ${Math.min(index + WIKIDATA_BATCH_SIZE, itemIds.length)}/${itemIds.length}`,
    );
  }

  const resolved = new Map<string, ResolvedFilm>();
  for (const [page, item] of itemsByPage) {
    const film = filmsByItem.get(item);
    if (film) {
      resolved.set(page, film);
    }
  }

  return resolved;
}

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
  const url = buildUrl(`${TMDB_API}/find/${imdbId}`, {
    api_key: tmdbApiKey,
    external_source: 'imdb_id',
  });

  try {
    const response = await fetchJsonWithRetry<TmdbFindResponse>(url);
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
