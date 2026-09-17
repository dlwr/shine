import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {generateUUID} from '@shine/utils';
import {withDefaultTranslationFlags} from '../common/default-translations';
import {
  insertImdbAndTmdbReferenceUrls,
  insertTmdbPosterUrl,
} from '../common/movie-reference-records';
import {pickJapaneseTitle} from '@shine/tmdb/japanese-title';
import {type TMDBConfig} from '@shine/tmdb';
import {
  type CsvMovieRow,
  type DatabaseClient,
  type TmdbMovieDetails,
} from './types';

type InsertMovieParameters = {
  database: DatabaseClient;
  tmdbConfig: TMDBConfig | undefined;
  imdbId: string;
  tmdbMovie: TmdbMovieDetails;
  jaTitle?: string;
  originalTitle?: string;
  csvYear?: string;
  csvReleaseDate?: string;
  csvDescription?: string;
};

export async function insertMovieWithTranslations({
  database,
  tmdbConfig,
  imdbId,
  tmdbMovie,
  jaTitle,
  originalTitle,
  csvYear,
  csvReleaseDate,
  csvDescription,
}: InsertMovieParameters): Promise<string> {
  const releaseYear =
    (tmdbMovie.release_date && Number(tmdbMovie.release_date.slice(0, 4))) ||
    (csvYear ? Number(csvYear) : undefined);
  const normalizedYear =
    typeof releaseYear === 'number' && Number.isFinite(releaseYear)
      ? releaseYear
      : undefined;
  const releaseDate =
    (tmdbMovie.release_date && tmdbMovie.release_date.trim()) ||
    (csvReleaseDate && csvReleaseDate.trim()) ||
    undefined;

  const movieUid = generateUUID();
  const tmdbId = typeof tmdbMovie.id === 'number' ? tmdbMovie.id : undefined;

  const mediaType = tmdbMovie.media_type === 'tv' ? 'tv' : 'movie';

  const movieValues: typeof movies.$inferInsert = {
    uid: movieUid,
    imdbId,
    originalLanguage: tmdbMovie.original_language ?? 'en',
    year: normalizedYear,
    mediaType,
    ...(tmdbId !== undefined && {tmdbId}),
    ...(releaseDate !== undefined && {releaseDate}),
  };

  await database.insert(movies).values(movieValues);

  await insertTranslations({
    database,
    movieUid,
    tmdbMovie,
    jaTitle,
    originalTitle,
    csvDescription,
  });

  await insertImdbAndTmdbReferenceUrls(
    database,
    movieUid,
    imdbId,
    tmdbId,
    tmdbMovie.media_type,
  );
  if (tmdbConfig && tmdbMovie.poster_path) {
    await insertTmdbPosterUrl(
      database,
      tmdbConfig,
      movieUid,
      tmdbMovie.poster_path,
    );
  }

  return movieUid;
}

export async function insertMovieFromCsvRecord({
  database,
  tmdbConfig,
  imdbId,
  record,
}: {
  database: DatabaseClient;
  tmdbConfig: TMDBConfig | undefined;
  imdbId: string;
  record: CsvMovieRow;
}): Promise<string> {
  const csvTitle = record.Title?.trim();
  const csvOriginalTitle = record['Original Title']?.trim();
  const csvDescription = record.Description?.trim();
  const csvReleaseDate = record['Release Date']?.trim();

  const fallbackMovie: TmdbMovieDetails = {
    title: csvTitle || csvOriginalTitle || `Untitled (${imdbId})`,
    original_title: csvOriginalTitle || csvTitle || `Untitled (${imdbId})`,
    release_date: csvReleaseDate || undefined,
    overview: csvDescription || '',
    imdb_id: imdbId,
    media_type: 'movie',
  };

  return insertMovieWithTranslations({
    database,
    tmdbConfig,
    imdbId,
    tmdbMovie: fallbackMovie,
    jaTitle: csvTitle,
    originalTitle: csvOriginalTitle,
    csvYear: record.Year?.trim(),
    csvReleaseDate,
    csvDescription,
  });
}

export async function insertTranslations({
  database,
  movieUid,
  tmdbMovie,
  jaTitle,
  originalTitle,
  csvDescription,
}: {
  database: DatabaseClient;
  movieUid: string;
  tmdbMovie: TmdbMovieDetails;
  jaTitle?: string;
  originalTitle?: string;
  csvDescription?: string;
}) {
  const englishTitle =
    originalTitle || tmdbMovie.original_title || tmdbMovie.title;
  const japaneseTitle =
    jaTitle ||
    pickJapaneseTitle({
      title: tmdbMovie.localizedTitle,
      original_title: tmdbMovie.original_title,
      original_language: tmdbMovie.original_language,
    });

  const values: Array<typeof translations.$inferInsert> = [];

  if (englishTitle) {
    values.push({
      resourceType: 'movie_title',
      resourceUid: movieUid,
      languageCode: 'en',
      content: englishTitle,
    });
  }

  if (japaneseTitle) {
    values.push({
      resourceType: 'movie_title',
      resourceUid: movieUid,
      languageCode: 'ja',
      content: japaneseTitle,
    });
  }

  const englishOverview = tmdbMovie.overview?.trim() || csvDescription?.trim();
  if (englishOverview) {
    values.push({
      resourceType: 'movie_description',
      resourceUid: movieUid,
      languageCode: 'en',
      content: englishOverview,
    });
  }

  const japaneseOverview = tmdbMovie.localizedOverview?.trim();
  if (japaneseOverview) {
    values.push({
      resourceType: 'movie_description',
      resourceUid: movieUid,
      languageCode: 'ja',
      content: japaneseOverview,
    });
  }

  if (values.length === 0) {
    return;
  }

  await database
    .insert(translations)
    .values(
      withDefaultTranslationFlags(tmdbMovie.original_language ?? 'en', values),
    )
    .onConflictDoNothing();
}
