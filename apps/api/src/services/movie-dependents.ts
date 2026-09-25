import {eq, type getDatabase, type WriteStatement} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {quizSelections} from '@shine/database/schema/quiz-selections';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {watchedMarks} from '@shine/database/schema/watched-marks';
import type {MergeMoviesOptions} from '../types/movies';

type Database = ReturnType<typeof getDatabase>;

export const movieDependentTables = [
  articleLinks,
  movieCredits,
  movieAvailabilityChecks,
  movieSelections,
  quizSelections,
  nominations,
  referenceUrls,
  translations,
  posterUrls,
  watchedMarks,
] as const;

export type ReassignMovieDependentsOptions = Pick<
  MergeMoviesOptions,
  'preserveTranslations' | 'preservePosters'
>;

export function deleteMovieDependents(
  database: Database,
  movieUid: string,
): WriteStatement[] {
  return [
    database.delete(articleLinks).where(eq(articleLinks.movieUid, movieUid)),
    database.delete(movieCredits).where(eq(movieCredits.movieUid, movieUid)),
    database
      .delete(movieAvailabilityChecks)
      .where(eq(movieAvailabilityChecks.movieUid, movieUid)),
    database
      .delete(movieSelections)
      .where(eq(movieSelections.movieId, movieUid)),
    database
      .delete(quizSelections)
      .where(eq(quizSelections.movieUid, movieUid)),
    database.delete(nominations).where(eq(nominations.movieUid, movieUid)),
    database.delete(referenceUrls).where(eq(referenceUrls.movieUid, movieUid)),
    database.delete(translations).where(eq(translations.resourceUid, movieUid)),
    database.delete(posterUrls).where(eq(posterUrls.movieUid, movieUid)),
    database.delete(watchedMarks).where(eq(watchedMarks.movieUid, movieUid)),
  ];
}

/** 読み取りを先に済ませ、付け替えの書き込みだけを順に並べて返す */
export async function reassignMovieDependents(
  database: Database,
  sourceMovieUid: string,
  targetMovieUid: string,
  options: ReassignMovieDependentsOptions = {},
): Promise<WriteStatement[]> {
  const {preserveTranslations = true, preservePosters = true} = options;

  return [
    database
      .update(articleLinks)
      .set({movieUid: targetMovieUid})
      .where(eq(articleLinks.movieUid, sourceMovieUid)),
    ...(await reassignCredits(database, sourceMovieUid, targetMovieUid)),
    database
      .delete(movieAvailabilityChecks)
      .where(eq(movieAvailabilityChecks.movieUid, sourceMovieUid)),
    database
      .update(movieSelections)
      .set({movieId: targetMovieUid})
      .where(eq(movieSelections.movieId, sourceMovieUid)),
    database
      .update(quizSelections)
      .set({movieUid: targetMovieUid})
      .where(eq(quizSelections.movieUid, sourceMovieUid)),
    database
      .update(nominations)
      .set({movieUid: targetMovieUid})
      .where(eq(nominations.movieUid, sourceMovieUid)),
    database
      .update(referenceUrls)
      .set({movieUid: targetMovieUid})
      .where(eq(referenceUrls.movieUid, sourceMovieUid)),
    ...(preserveTranslations
      ? await mergeTranslations(database, sourceMovieUid, targetMovieUid)
      : []),
    database
      .delete(translations)
      .where(eq(translations.resourceUid, sourceMovieUid)),
    ...(preservePosters
      ? await mergePosters(database, sourceMovieUid, targetMovieUid)
      : []),
    database.delete(posterUrls).where(eq(posterUrls.movieUid, sourceMovieUid)),
    database
      .delete(watchedMarks)
      .where(eq(watchedMarks.movieUid, sourceMovieUid)),
  ];
}

async function reassignCredits(
  database: Database,
  sourceMovieUid: string,
  targetMovieUid: string,
): Promise<WriteStatement[]> {
  const targetCredits = await database
    .select({uid: movieCredits.uid})
    .from(movieCredits)
    .where(eq(movieCredits.movieUid, targetMovieUid));

  return [
    targetCredits.length > 0
      ? database
          .delete(movieCredits)
          .where(eq(movieCredits.movieUid, sourceMovieUid))
      : database
          .update(movieCredits)
          .set({movieUid: targetMovieUid})
          .where(eq(movieCredits.movieUid, sourceMovieUid)),
  ];
}

async function mergeTranslations(
  database: Database,
  sourceMovieUid: string,
  targetMovieUid: string,
): Promise<WriteStatement[]> {
  const sourceTranslations = await database
    .select()
    .from(translations)
    .where(eq(translations.resourceUid, sourceMovieUid));

  return sourceTranslations.map(translation =>
    database
      .insert(translations)
      .values({
        resourceType: translation.resourceType,
        resourceUid: targetMovieUid,
        languageCode: translation.languageCode,
        content: translation.content,
        isDefault: translation.isDefault,
      })
      .onConflictDoNothing({
        target: [
          translations.resourceType,
          translations.resourceUid,
          translations.languageCode,
        ],
      }),
  );
}

async function mergePosters(
  database: Database,
  sourceMovieUid: string,
  targetMovieUid: string,
): Promise<WriteStatement[]> {
  const sourcePosters = await database
    .select()
    .from(posterUrls)
    .where(eq(posterUrls.movieUid, sourceMovieUid));

  const existingTargetPosters = await database
    .select({url: posterUrls.url})
    .from(posterUrls)
    .where(eq(posterUrls.movieUid, targetMovieUid));

  const existingUrls = new Set(existingTargetPosters.map(poster => poster.url));

  return sourcePosters
    .filter(poster => !existingUrls.has(poster.url))
    .map(poster =>
      database.insert(posterUrls).values({
        movieUid: targetMovieUid,
        url: poster.url,
        width: poster.width,
        height: poster.height,
        languageCode: poster.languageCode,
        countryCode: poster.countryCode,
        sourceType: poster.sourceType,
        isPrimary: poster.isPrimary,
      }),
    );
}
