import {type getDatabase} from '@shine/database';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {type TMDBConfig} from './tmdb-utilities';

type DatabaseClient = ReturnType<typeof getDatabase>;

export async function insertImdbAndTmdbReferenceUrls(
  database: DatabaseClient,
  movieUid: string,
  imdbId: string,
  tmdbId: number | undefined,
  mediaType: 'movie' | 'tv' = 'movie',
): Promise<void> {
  const values: Array<typeof referenceUrls.$inferInsert> = [
    {
      movieUid,
      url: `https://www.imdb.com/title/${imdbId}/`,
      sourceType: 'imdb',
      languageCode: 'en',
      isPrimary: 1,
    },
  ];

  if (tmdbId !== undefined) {
    values.push({
      movieUid,
      url: `https://www.themoviedb.org/${mediaType}/${tmdbId}`,
      sourceType: 'other',
      languageCode: 'en',
      isPrimary: 0,
      description: 'TMDb entry',
    });
  }

  await database.insert(referenceUrls).values(values).onConflictDoNothing();
}

export async function insertTmdbPosterUrl(
  database: DatabaseClient,
  tmdbConfig: TMDBConfig,
  movieUid: string,
  posterPath: string,
): Promise<void> {
  const size = tmdbConfig.images.poster_sizes.includes('w500')
    ? 'w500'
    : 'original';

  await database
    .insert(posterUrls)
    .values({
      movieUid,
      url: `${tmdbConfig.images.secure_base_url}${size}${posterPath}`,
      sourceType: 'tmdb',
      isPrimary: 1,
    })
    .onConflictDoNothing();
}
