import {findTMDBByImdbId} from '../common/tmdb-utilities';
import {type CsvMovieRow, type TmdbMovieDetails} from './types';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

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

export async function fetchMovieByImdbId(
  tmdbApiKey: string,
  imdbId: string,
): Promise<TmdbMovieDetails | undefined> {
  const findResult = await findTMDBByImdbId(imdbId, tmdbApiKey);
  if (!findResult) {
    return undefined;
  }

  if (findResult.mediaType === 'movie') {
    return fetchMovieDetails(tmdbApiKey, findResult.tmdbId);
  }

  const tvDetails = await fetchTvDetails(tmdbApiKey, findResult.tmdbId);
  if (tvDetails) {
    return {
      ...tvDetails,
      imdb_id: imdbId,
    };
  }

  return undefined;
}

export async function searchMovieByTitle(
  tmdbApiKey: string,
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

  const response = await fetch(searchUrl.href);
  if (response.ok) {
    const data = (await response.json()) as {
      results: TmdbMovieSearchResult[];
    };
    const results = data.results ?? [];
    for (const result of results) {
      const details = await fetchMovieDetails(tmdbApiKey, result.id);
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

  const multiResponse = await fetch(multiUrl.href);
  if (multiResponse.ok) {
    const data = (await multiResponse.json()) as {
      results: TmdbMultiSearchResult[];
    };
    const pageResults = data.results ?? [];
    for (const result of pageResults) {
      if (result.media_type === 'movie') {
        const details = await fetchMovieDetails(tmdbApiKey, result.id);
        if (details) {
          return details;
        }
      } else if (result.media_type === 'tv') {
        const details = await fetchTvDetails(tmdbApiKey, result.id);
        if (details) {
          return details;
        }
      }
    }
  }

  return undefined;
}

export async function fetchMovieDetails(
  tmdbApiKey: string,
  tmdbId: number,
): Promise<TmdbMovieDetails | undefined> {
  const detailUrl = new URL(`${TMDB_API_BASE_URL}/movie/${tmdbId}`);
  detailUrl.searchParams.set('api_key', tmdbApiKey);
  detailUrl.searchParams.set('language', 'en-US');

  const response = await fetch(detailUrl.href);
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
    const localizedResponse = await fetch(localizedUrl.href);
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

export async function fetchTvDetails(
  tmdbApiKey: string,
  tmdbId: number,
): Promise<TmdbMovieDetails | undefined> {
  const detailUrl = new URL(`${TMDB_API_BASE_URL}/tv/${tmdbId}`);
  detailUrl.searchParams.set('api_key', tmdbApiKey);
  detailUrl.searchParams.set('language', 'en-US');

  const response = await fetch(detailUrl.href);
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
    const localizedResponse = await fetch(localizedUrl.href);
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
