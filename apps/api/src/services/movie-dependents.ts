import {eq, type getDatabase} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {quizSelections} from '@shine/database/schema/quiz-selections';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import type {MergeMoviesOptions} from '../types/services';

type Database = ReturnType<typeof getDatabase>;
export type MovieDependentsExecutor = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

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
] as const;

export type ReassignMovieDependentsOptions = Pick<
  MergeMoviesOptions,
  'preserveTranslations' | 'preservePosters'
>;

export async function deleteMovieDependents(
  trx: MovieDependentsExecutor,
  movieUid: string,
): Promise<void> {
  await trx.delete(articleLinks).where(eq(articleLinks.movieUid, movieUid));
  await trx.delete(movieCredits).where(eq(movieCredits.movieUid, movieUid));
  await trx
    .delete(movieAvailabilityChecks)
    .where(eq(movieAvailabilityChecks.movieUid, movieUid));
  await trx
    .delete(movieSelections)
    .where(eq(movieSelections.movieId, movieUid));
  await trx.delete(quizSelections).where(eq(quizSelections.movieUid, movieUid));
  await trx.delete(nominations).where(eq(nominations.movieUid, movieUid));
  await trx.delete(referenceUrls).where(eq(referenceUrls.movieUid, movieUid));
  await trx.delete(translations).where(eq(translations.resourceUid, movieUid));
  await trx.delete(posterUrls).where(eq(posterUrls.movieUid, movieUid));
}

export async function reassignMovieDependents(
  trx: MovieDependentsExecutor,
  sourceMovieUid: string,
  targetMovieUid: string,
  options: ReassignMovieDependentsOptions = {},
): Promise<void> {
  const {preserveTranslations = true, preservePosters = true} = options;

  await trx
    .update(articleLinks)
    .set({movieUid: targetMovieUid})
    .where(eq(articleLinks.movieUid, sourceMovieUid));

  await reassignCredits(trx, sourceMovieUid, targetMovieUid);

  await trx
    .delete(movieAvailabilityChecks)
    .where(eq(movieAvailabilityChecks.movieUid, sourceMovieUid));

  await trx
    .update(movieSelections)
    .set({movieId: targetMovieUid})
    .where(eq(movieSelections.movieId, sourceMovieUid));

  await trx
    .update(quizSelections)
    .set({movieUid: targetMovieUid})
    .where(eq(quizSelections.movieUid, sourceMovieUid));

  await trx
    .update(nominations)
    .set({movieUid: targetMovieUid})
    .where(eq(nominations.movieUid, sourceMovieUid));

  await trx
    .update(referenceUrls)
    .set({movieUid: targetMovieUid})
    .where(eq(referenceUrls.movieUid, sourceMovieUid));

  if (preserveTranslations) {
    await mergeTranslations(trx, sourceMovieUid, targetMovieUid);
  }

  await trx
    .delete(translations)
    .where(eq(translations.resourceUid, sourceMovieUid));

  if (preservePosters) {
    await mergePosters(trx, sourceMovieUid, targetMovieUid);
  }

  await trx.delete(posterUrls).where(eq(posterUrls.movieUid, sourceMovieUid));
}

async function reassignCredits(
  trx: MovieDependentsExecutor,
  sourceMovieUid: string,
  targetMovieUid: string,
): Promise<void> {
  const targetCredits = await trx
    .select({uid: movieCredits.uid})
    .from(movieCredits)
    .where(eq(movieCredits.movieUid, targetMovieUid));

  await (targetCredits.length > 0
    ? trx.delete(movieCredits).where(eq(movieCredits.movieUid, sourceMovieUid))
    : trx
        .update(movieCredits)
        .set({movieUid: targetMovieUid})
        .where(eq(movieCredits.movieUid, sourceMovieUid)));
}

async function mergeTranslations(
  trx: MovieDependentsExecutor,
  sourceMovieUid: string,
  targetMovieUid: string,
): Promise<void> {
  const sourceTranslations = await trx
    .select()
    .from(translations)
    .where(eq(translations.resourceUid, sourceMovieUid));

  for (const translation of sourceTranslations) {
    await trx
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
      });
  }
}

async function mergePosters(
  trx: MovieDependentsExecutor,
  sourceMovieUid: string,
  targetMovieUid: string,
): Promise<void> {
  const sourcePosters = await trx
    .select()
    .from(posterUrls)
    .where(eq(posterUrls.movieUid, sourceMovieUid));

  const existingTargetPosters = await trx
    .select({url: posterUrls.url})
    .from(posterUrls)
    .where(eq(posterUrls.movieUid, targetMovieUid));

  const existingUrls = new Set(existingTargetPosters.map(poster => poster.url));

  for (const poster of sourcePosters) {
    if (existingUrls.has(poster.url)) {
      continue;
    }

    await trx.insert(posterUrls).values({
      movieUid: targetMovieUid,
      url: poster.url,
      width: poster.width,
      height: poster.height,
      languageCode: poster.languageCode,
      countryCode: poster.countryCode,
      sourceType: poster.sourceType,
      isPrimary: poster.isPrimary,
    });
  }
}
