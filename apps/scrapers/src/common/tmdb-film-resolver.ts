import {setTimeout as sleep} from 'node:timers/promises';
import {buildUrl, fetchJsonWithRetry} from './fetch-utilities';
import {fetchTMDBMovieDetails} from './tmdb-utilities';
import {type FilmReference, type ResolvedFilm} from './wikidata-film-resolver';

const TMDB_API = 'https://api.themoviedb.org/3';
const IMDB_ID_PATTERN = /^tt\d+$/;

export type TmdbSearchResult = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  original_language?: string;
};

function normalizeTitle(value: string | undefined): string {
  return (value ?? '').replaceAll(/[\s\u{3000}]/gu, '').toLowerCase();
}

/** 外国映画は本国公開から日本公開までのずれがあるので過去側に幅を持たせる */
const FOREIGN_YEAR_WINDOW = 15;

/** 同名のリメイクが多いので、絞り込んだ結果が1件のときだけ採用する */
export function selectTmdbMatch(
  results: TmdbSearchResult[],
  title: string,
  year: number,
  {foreign = false}: {foreign?: boolean} = {},
): TmdbSearchResult | undefined {
  const normalized = normalizeTitle(title);
  const matches = results.filter(result => {
    const isJapanese = result.original_language === 'ja';
    if (foreign === isJapanese) {
      return false;
    }

    const releaseDate = result.release_date?.slice(0, 4);
    if (!releaseDate) {
      return false;
    }

    const releaseYear = Number(releaseDate);
    if (!Number.isFinite(releaseYear)) {
      return false;
    }

    const earliest = year - (foreign ? FOREIGN_YEAR_WINDOW : 1);
    if (releaseYear < earliest || releaseYear > year + 1) {
      return false;
    }

    return (
      normalizeTitle(result.title) === normalized ||
      normalizeTitle(result.original_title) === normalized
    );
  });

  return matches.length === 1 ? matches[0] : undefined;
}

async function searchTmdbByJapaneseTitle(
  title: string,
  tmdbApiKey: string,
): Promise<TmdbSearchResult[]> {
  const url = buildUrl(`${TMDB_API}/search/movie`, {
    api_key: tmdbApiKey,
    query: title,
    language: 'ja-JP',
    include_adult: 'false',
  });

  const response = await fetchJsonWithRetry<{results?: TmdbSearchResult[]}>(
    url,
  );

  return response.results ?? [];
}

export async function resolveFilmsByTmdb(
  entries: Array<{key: string; title: string; year: number; foreign: boolean}>,
  tmdbApiKey: string,
  throttleMs: number,
): Promise<Map<string, ResolvedFilm>> {
  const resolved = new Map<string, ResolvedFilm>();

  for (const entry of entries) {
    try {
      const results = await searchTmdbByJapaneseTitle(entry.title, tmdbApiKey);
      const match = selectTmdbMatch(results, entry.title, entry.year, {
        foreign: entry.foreign,
      });
      if (match) {
        const details = await fetchTMDBMovieDetails(match.id, tmdbApiKey);
        const imdbId = details?.imdb_id;
        if (imdbId && IMDB_ID_PATTERN.test(imdbId)) {
          resolved.set(entry.key, {imdbId, englishTitle: details?.title});
          console.log(
            `  TMDb fallback: ${entry.title} (${entry.year}) -> ${imdbId} (TMDb ${match.id})`,
          );
        }
      }
    } catch (error) {
      console.error(`  TMDb fallback failed for ${entry.title}:`, error);
    }

    if (throttleMs > 0) {
      await sleep(throttleMs);
    }
  }

  return resolved;
}

/** 記事名から同定できなかった作品を、邦題と年でTMDbから引き直す */
export async function resolveRemainingByTmdb({
  references,
  resolved,
  tmdbApiKey,
  throttleMs,
  resolveFilms = resolveFilmsByTmdb,
}: {
  references: FilmReference[];
  resolved: Map<string, ResolvedFilm>;
  tmdbApiKey: string | undefined;
  throttleMs: number;
  resolveFilms?: typeof resolveFilmsByTmdb;
}): Promise<number> {
  if (!tmdbApiKey) {
    return 0;
  }

  const pending = new Map(
    references
      .filter(reference => !resolved.has(reference.key))
      .map(reference => [
        reference.key,
        {
          key: reference.key,
          title: reference.title,
          year: reference.targetYear,
          foreign: reference.foreign ?? false,
        },
      ]),
  );

  console.log(`TMDb fallback for ${pending.size} films...`);
  const fallback = await resolveFilms(
    pending.values().toArray(),
    tmdbApiKey,
    throttleMs,
  );

  for (const [key, film] of fallback) {
    resolved.set(key, film);
  }

  console.log(`TMDb fallback resolved ${fallback.size}/${pending.size}`);
  return fallback.size;
}
