import type {movies} from '@shine/database/schema/movies';
import {ValidationError} from './errors';

export type UpdateMovieInput = {
  year?: unknown;
  originalLanguage?: unknown;
  mediaType?: unknown;
};

type MovieUpdate = Partial<typeof movies.$inferInsert>;

export function parseMovieUpdate(input: UpdateMovieInput): MovieUpdate {
  const {year, originalLanguage, mediaType} = input;
  const updateData: MovieUpdate = {};

  if (year !== undefined) {
    if (
      typeof year !== 'number' ||
      !Number.isSafeInteger(year) ||
      year < 1888 ||
      year > 2100
    ) {
      throw new ValidationError(
        'Year must be a valid integer between 1888 and 2100',
      );
    }

    updateData.year = year;
  }

  if (originalLanguage !== undefined) {
    if (!originalLanguage) {
      updateData.originalLanguage = 'en';
    } else if (typeof originalLanguage !== 'string') {
      throw new ValidationError('Original language must be a string');
    } else if (originalLanguage.length === 2) {
      updateData.originalLanguage = originalLanguage;
    } else {
      throw new ValidationError(
        'Original language must be a 2-letter ISO 639-1 code',
      );
    }
  }

  if (mediaType !== undefined) {
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      throw new ValidationError("mediaType must be 'movie' or 'tv'");
    }

    updateData.mediaType = mediaType;
  }

  return updateData;
}
