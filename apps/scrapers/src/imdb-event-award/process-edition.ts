import {and, inArray, isNotNull} from 'drizzle-orm';
import {movies} from '@shine/database/schema/movies';
import {createMovie} from './create-movie';
import {ensureFilmNomination, loadFilmNominations} from './film-nomination';
import {ensurePersonNominations} from './person-nomination';
import {type AwardEdition, type ImportContext} from './types';

export async function processEdition(
  context: ImportContext,
  edition: AwardEdition,
  ceremonyUid: string,
  categoryUid: string,
): Promise<void> {
  const {database, stats} = context;
  const imdbIds = edition.films.map(film => film.imdbId);

  const existingMovies = await database
    .select({
      uid: movies.uid,
      imdbId: movies.imdbId,
      deletedAt: movies.deletedAt,
    })
    .from(movies)
    .where(and(isNotNull(movies.imdbId), inArray(movies.imdbId, imdbIds)));

  const activeByImdbId = new Map<string, string>();
  const softDeletedImdbIds = new Set<string>();
  for (const movie of existingMovies) {
    if (!movie.imdbId) {
      continue;
    }

    if (movie.deletedAt === null) {
      activeByImdbId.set(movie.imdbId, movie.uid);
    } else {
      softDeletedImdbIds.add(movie.imdbId);
    }
  }

  const nominationsByMovieUid = await loadFilmNominations(
    context,
    ceremonyUid,
    categoryUid,
  );

  for (const film of edition.films) {
    if (softDeletedImdbIds.has(film.imdbId)) {
      console.log(`  Skipping soft-deleted movie: ${film.imdbId}`);
      stats.skippedSoftDeleted++;
      continue;
    }

    try {
      let movieUid = activeByImdbId.get(film.imdbId);
      if (movieUid) {
        stats.moviesExisting++;
      } else {
        movieUid = await createMovie(context, film, edition.year);
        if (!movieUid) {
          continue;
        }
      }

      await (film.people
        ? ensurePersonNominations(
            context,
            movieUid,
            ceremonyUid,
            categoryUid,
            film,
          )
        : ensureFilmNomination(
            context,
            movieUid,
            ceremonyUid,
            categoryUid,
            film,
            nominationsByMovieUid,
          ));
    } catch (error) {
      console.error(`  Failed to process ${film.imdbId}:`, error);
      stats.failed++;
    }
  }
}
