import {
  findTMDBByImdbId,
  isTmdbNotFound,
  searchTMDBMovies,
  searchTMDBMulti,
  tmdbGet,
  type TMDBMediaType,
} from '@shine/tmdb';
import {type CsvMovieRow, type TmdbMovieDetails} from './types';

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

  const movieResults = await searchOrEmpty(() =>
    searchTMDBMovies(tmdbApiKey, {
      query,
      include_adult: 'false',
      ...(year && {year}),
    }),
  );
  for (const result of movieResults) {
    const details = await fetchMovieDetails(tmdbApiKey, result.id);
    if (details) {
      return details;
    }
  }

  const multiResults = await searchOrEmpty(() =>
    searchTMDBMulti(tmdbApiKey, {
      query,
      include_adult: 'false',
      ...(year && {first_air_date_year: year}),
    }),
  );
  for (const result of multiResults) {
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

  return undefined;
}

async function searchOrEmpty<T>(search: () => Promise<T[]>): Promise<T[]> {
  try {
    return await search();
  } catch {
    return [];
  }
}

async function fetchDetailsOrUndefined<T>(
  mediaType: TMDBMediaType,
  tmdbApiKey: string,
  tmdbId: number,
  language: string,
): Promise<T | undefined> {
  try {
    return await tmdbGet<T>(`${mediaType}/${tmdbId}`, tmdbApiKey, {language});
  } catch (error) {
    if (isTmdbNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

async function fetchLocalizedFields(
  mediaType: TMDBMediaType,
  tmdbApiKey: string,
  tmdbId: number,
): Promise<{localizedTitle?: string; localizedOverview?: string}> {
  try {
    const localized = await tmdbGet<{
      title?: string;
      name?: string;
      overview?: string;
    }>(`${mediaType}/${tmdbId}`, tmdbApiKey, {language: 'ja'});
    return {
      localizedTitle: mediaType === 'tv' ? localized.name : localized.title,
      localizedOverview: localized.overview,
    };
  } catch (error) {
    console.warn(`    Failed to fetch localized TMDb data: ${String(error)}`);
    return {};
  }
}

export async function fetchMovieDetails(
  tmdbApiKey: string,
  tmdbId: number,
): Promise<TmdbMovieDetails | undefined> {
  const details = await fetchDetailsOrUndefined<TmdbMovieDetails>(
    'movie',
    tmdbApiKey,
    tmdbId,
    'en-US',
  );
  if (!details) {
    return undefined;
  }

  return {
    ...details,
    media_type: 'movie',
    ...(await fetchLocalizedFields('movie', tmdbApiKey, tmdbId)),
  };
}

export async function fetchTvDetails(
  tmdbApiKey: string,
  tmdbId: number,
): Promise<TmdbMovieDetails | undefined> {
  const details = await fetchDetailsOrUndefined<{
    id: number;
    name: string;
    original_name?: string;
    overview?: string;
    poster_path?: string;
    first_air_date?: string;
    original_language?: string;
  }>('tv', tmdbApiKey, tmdbId, 'en-US');
  if (!details) {
    return undefined;
  }

  return {
    id: details.id,
    title: details.name,
    original_title: details.original_name ?? details.name,
    original_language: details.original_language,
    release_date: details.first_air_date ?? undefined,
    poster_path: details.poster_path ?? undefined,
    overview: details.overview ?? '',
    media_type: 'tv',
    ...(await fetchLocalizedFields('tv', tmdbApiKey, tmdbId)),
  };
}
