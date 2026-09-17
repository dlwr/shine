/**
 * TMDb API v3 の HTTP クライアント。DB には触らない
 */
import {buildUrl, FetchHttpError, fetchJsonWithRetry} from '@shine/utils/fetch';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

export type TMDBMediaType = 'movie' | 'tv';

export type TMDBMovieData = {
  id: number;
  title: string;
  original_title: string;
  original_language?: string;
  overview?: string;
  release_date: string;
  imdb_id?: string;
  poster_path?: string;
  translations?: {
    translations: Array<{
      iso_3166_1: string;
      iso_639_1: string;
      name: string;
      english_name: string;
      data: {
        title?: string;
        name?: string;
        overview?: string;
      };
    }>;
  };
};

export type TMDBTvData = {
  id: number;
  name: string;
  original_name: string;
  original_language?: string;
  overview?: string;
  first_air_date: string;
  imdb_id?: string;
  poster_path?: string;
};

export type TMDBCastCredit = {
  credit_id: string;
  id: number;
  name: string;
  original_name: string;
  character?: string;
  order: number;
  profile_path?: string | undefined;
};

export type TMDBCrewCredit = {
  credit_id: string;
  id: number;
  name: string;
  original_name: string;
  job: string;
  department: string;
  profile_path?: string | undefined;
};

export type TMDBCredits = {
  cast: TMDBCastCredit[];
  crew: TMDBCrewCredit[];
};

export type TMDBFindResponse = {
  movie_results: TMDBMovieData[];
  tv_results: TMDBTvData[];
};

export type TMDBFindResult = {
  tmdbId: number;
  mediaType: TMDBMediaType;
};

export type TMDBMovieImages = {
  id: number;
  posters: Array<{
    file_path: string;
    width: number;
    height: number;
    iso_639_1: string | undefined;
  }>;
};

export type TMDBSearchMovieResult = {
  id: number;
  title: string;
  original_title?: string;
  original_language?: string;
  release_date?: string;
  poster_path?: string;
  overview?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
};

export type TMDBSearchResponse = {
  results: TMDBSearchMovieResult[];
};

export type TMDBMultiSearchResult = {
  id: number;
  media_type: string;
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
};

export type TMDBConfig = {
  images: {
    secure_base_url: string;
    poster_sizes: string[];
  };
};

export type TMDBTranslationsResponse = {
  id: number;
  translations: Array<{
    iso_3166_1: string;
    iso_639_1: string;
    name: string;
    english_name: string;
    data: {
      homepage: string;
      overview: string;
      runtime: number;
      tagline: string;
      title: string;
      name?: string;
    };
  }>;
};

export type TMDBPersonData = {
  id: number;
  name: string;
  profile_path?: string | null;
};

export type TMDBExternalIds = {
  imdb_id?: string | null;
};

export type TMDBMovieSummary = {
  imdbId?: string;
  originalLanguage?: string;
};

export async function tmdbGet<T>(
  path: string,
  tmdbApiKey: string,
  parameters: Record<string, string> = {},
): Promise<T> {
  const url = buildUrl(`${TMDB_API_BASE_URL}/${path}`, {
    api_key: tmdbApiKey,
    ...parameters,
  });
  return fetchJsonWithRetry<T>(url);
}

export function isTmdbNotFound(error: unknown): boolean {
  return error instanceof FetchHttpError && error.status === 404;
}

async function tmdbGetUnlessNotFound<T>(
  path: string,
  tmdbApiKey: string,
  parameters: Record<string, string> = {},
): Promise<T | undefined> {
  try {
    return await tmdbGet<T>(path, tmdbApiKey, parameters);
  } catch (error) {
    if (isTmdbNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

/**
 * TMDb APIの画像設定を取得(プロセス内でキャッシュ)
 */
export const fetchTMDBConfig = (() => {
  let cached: TMDBConfig | undefined;

  return async (tmdbApiKey: string): Promise<TMDBConfig> => {
    cached ??= await tmdbGet<TMDBConfig>('configuration', tmdbApiKey);
    return cached;
  };
})();

export async function fetchTMDBMovieTranslations(
  movieId: number,
  tmdbApiKey: string,
  mediaType: TMDBMediaType = 'movie',
): Promise<TMDBTranslationsResponse | undefined> {
  return tmdbGetUnlessNotFound<TMDBTranslationsResponse>(
    `${mediaType}/${movieId}/translations`,
    tmdbApiKey,
  );
}

export async function searchTMDBMovies(
  tmdbApiKey: string,
  parameters: Record<string, string>,
): Promise<TMDBSearchMovieResult[]> {
  const data = await tmdbGet<{results?: TMDBSearchMovieResult[]}>(
    'search/movie',
    tmdbApiKey,
    parameters,
  );
  return data.results ?? [];
}

export async function searchTMDBMulti(
  tmdbApiKey: string,
  parameters: Record<string, string>,
): Promise<TMDBMultiSearchResult[]> {
  const data = await tmdbGet<{results?: TMDBMultiSearchResult[]}>(
    'search/multi',
    tmdbApiKey,
    parameters,
  );
  return data.results ?? [];
}

function releaseYear(movie: TMDBSearchMovieResult): number {
  return new Date(movie.release_date ?? '').getFullYear();
}

/**
 * タイトルと年で映画を検索し、年が近い 1 件の TMDb ID を返す
 */
export async function searchTMDBMovie(
  title: string,
  year: number,
  tmdbApiKey: string,
): Promise<number | undefined> {
  const withYear = await searchTMDBMovies(tmdbApiKey, {
    query: title,
    year: year.toString(),
    language: 'en-US',
  });
  const matchesWithYear = withYear.filter(
    movie => Math.abs(releaseYear(movie) - year) <= 1,
  );
  if (matchesWithYear.length > 0) {
    return matchesWithYear[0].id;
  }

  const withoutYear = await searchTMDBMovies(tmdbApiKey, {
    query: title,
    language: 'en-US',
  });
  const matches = withoutYear
    .filter(movie => Math.abs(releaseYear(movie) - year) <= 2)
    .toSorted(
      (a, b) =>
        Math.abs(releaseYear(a) - year) - Math.abs(releaseYear(b) - year),
    );
  return matches[0]?.id;
}

export async function fetchTMDBMovieDetails(
  movieId: number,
  tmdbApiKey: string,
  language = 'en-US',
): Promise<TMDBMovieData | undefined> {
  return tmdbGetUnlessNotFound<TMDBMovieData>(`movie/${movieId}`, tmdbApiKey, {
    language,
  });
}

export function normalizeTvData(
  data: TMDBTvData & {translations?: TMDBMovieData['translations']},
): TMDBMovieData {
  return {
    id: data.id,
    title: data.name,
    original_title: data.original_name,
    original_language: data.original_language,
    overview: data.overview,
    release_date: data.first_air_date,
    poster_path: data.poster_path,
    translations: data.translations,
  };
}

/**
 * TV番組の詳細を取得し、TMDBMovieData形式に正規化
 */
export async function fetchTMDBTvDetails(
  tvId: number,
  tmdbApiKey: string,
  language = 'en-US',
): Promise<TMDBMovieData | undefined> {
  const data = await tmdbGetUnlessNotFound<
    TMDBTvData & {translations?: TMDBMovieData['translations']}
  >(`tv/${tvId}`, tmdbApiKey, {language});
  return data && normalizeTvData(data);
}

export async function fetchTMDBDetails(
  tmdbId: number,
  mediaType: TMDBMediaType,
  tmdbApiKey: string,
  language = 'en-US',
): Promise<TMDBMovieData | undefined> {
  if (mediaType === 'tv') {
    return fetchTMDBTvDetails(tmdbId, tmdbApiKey, language);
  }

  return fetchTMDBMovieDetails(tmdbId, tmdbApiKey, language);
}

export async function fetchTMDBCredits(
  tmdbId: number,
  mediaType: TMDBMediaType,
  tmdbApiKey: string,
  language = 'ja-JP',
): Promise<TMDBCredits | undefined> {
  return tmdbGetUnlessNotFound<TMDBCredits>(
    `${mediaType}/${tmdbId}/credits`,
    tmdbApiKey,
    {language},
  );
}

/**
 * language を変えると name の表記が変わる（ja-JP で翻訳が無ければ原語）
 */
export async function fetchTMDBPerson(
  personId: number,
  tmdbApiKey: string,
  language = 'en-US',
): Promise<TMDBPersonData | undefined> {
  return tmdbGetUnlessNotFound<TMDBPersonData>(
    `person/${personId}`,
    tmdbApiKey,
    {language},
  );
}

export async function fetchTMDBExternalIds(
  tmdbId: number,
  tmdbApiKey: string,
  mediaType: TMDBMediaType = 'movie',
): Promise<TMDBExternalIds> {
  return tmdbGet<TMDBExternalIds>(
    `${mediaType}/${tmdbId}/external_ids`,
    tmdbApiKey,
  );
}

export async function findTMDBRecordsByImdbId(
  imdbId: string,
  tmdbApiKey: string,
): Promise<TMDBFindResponse> {
  return tmdbGet<TMDBFindResponse>(`find/${imdbId}`, tmdbApiKey, {
    external_source: 'imdb_id',
  });
}

export async function findTMDBByImdbId(
  imdbId: string,
  tmdbApiKey: string,
): Promise<TMDBFindResult | undefined> {
  const data = await tmdbGetUnlessNotFound<TMDBFindResponse>(
    `find/${imdbId}`,
    tmdbApiKey,
    {external_source: 'imdb_id'},
  );

  if (data?.movie_results && data.movie_results.length > 0) {
    return {tmdbId: data.movie_results[0].id, mediaType: 'movie'};
  }

  if (data?.tv_results && data.tv_results.length > 0) {
    return {tmdbId: data.tv_results[0].id, mediaType: 'tv'};
  }

  console.log(`No TMDb match found for IMDb ID: ${imdbId}`);
  return undefined;
}

export async function fetchTMDBImages(
  tmdbId: number,
  mediaType: TMDBMediaType,
  tmdbApiKey: string,
): Promise<TMDBMovieImages | undefined> {
  return tmdbGetUnlessNotFound<TMDBMovieImages>(
    `${mediaType}/${tmdbId}/images`,
    tmdbApiKey,
  );
}

export async function fetchTMDBMovieImages(
  imdbId: string,
  tmdbApiKey: string,
): Promise<
  | {images: TMDBMovieImages; tmdbId: number; mediaType: TMDBMediaType}
  | undefined
> {
  const findResult = await findTMDBByImdbId(imdbId, tmdbApiKey);
  if (!findResult) {
    return undefined;
  }

  const {tmdbId, mediaType} = findResult;
  const images = await fetchTMDBImages(tmdbId, mediaType, tmdbApiKey);
  if (!images) {
    return undefined;
  }

  return {images, tmdbId, mediaType};
}

/**
 * タイトルと年で検索した映画のIMDb IDと原語を取得
 */
export async function fetchTMDBMovieSummary(
  title: string,
  year: number,
  tmdbApiKey: string,
): Promise<TMDBMovieSummary> {
  const movieId = await searchTMDBMovie(title, year, tmdbApiKey);
  if (!movieId) {
    console.log(`No TMDb match found for ${title} (${year})`);
    return {};
  }

  const movieData = await fetchTMDBMovieDetails(movieId, tmdbApiKey);
  if (movieData?.imdb_id) {
    console.log(`Found IMDb ID for ${title} (${year}): ${movieData.imdb_id}`);
  } else {
    console.log(`No IMDb ID found for ${title} (${year})`);
  }

  return {
    imdbId: movieData?.imdb_id || undefined,
    originalLanguage: movieData?.original_language || undefined,
  };
}
