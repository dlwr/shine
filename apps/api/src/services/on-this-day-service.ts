import {sql} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {BaseService} from './base-service';
import type {AwardTaggedMovie} from '../types/award-tagged-movies';
import type {OnThisDay, OnThisDayMovie} from '../types/on-this-day';
import {loadAwardTaggedMovies} from './award-tagged-movies';
import {rankPeopleBornOn} from './prominent-people';

const PEOPLE_LIMIT = 8;

function compareMovies(a: OnThisDayMovie, b: OnThisDayMovie): number {
  return (
    a.releaseDate.localeCompare(b.releaseDate) || a.uid.localeCompare(b.uid)
  );
}

export class OnThisDayService extends BaseService {
  async getOnThisDay(monthDay: string): Promise<OnThisDay> {
    const {movies: taggedMovies, awards} = await loadAwardTaggedMovies(
      this.database,
      sql`substr(${movies.releaseDate}, 6, 5) = ${monthDay}`,
    );

    return {
      monthDay,
      movies: taggedMovies
        .filter(
          (movie): movie is AwardTaggedMovie & {releaseDate: string} =>
            movie.releaseDate !== undefined,
        )
        .map(movie => ({
          uid: movie.uid,
          title: movie.title,
          posterUrl: movie.posterUrl,
          releaseDate: movie.releaseDate,
          isWinner: movie.isWinner,
          awards: movie.awards,
        }))
        .toSorted(compareMovies),
      awards,
      people: await rankPeopleBornOn(
        this.database,
        monthDay,
        'ja',
        PEOPLE_LIMIT,
      ),
    };
  }
}
