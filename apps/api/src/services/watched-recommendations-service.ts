import {and, inArray, isNull} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import type {WatchedRecommendation} from '../types/watched-recommendations';
import {BaseService} from './base-service';
import {
  findMovieConnections,
  loadShowableMovies,
  type MovieConnection,
} from './movie-connections';
import {localizedMovieTitle} from './movie-title-columns';
import {loadMovieAvailabilityByMovie} from './watchable-availability';

const MAX_RECOMMENDATIONS = 10;
const KIND_ORDER: Array<MovieConnection['kind']> = [
  'director',
  'cast',
  'category',
];

function reasonOf(connection: MovieConnection, anchorTitle: string): string {
  switch (connection.kind) {
    case 'director': {
      return `『${anchorTitle}』と同じ監督（${connection.name}）`;
    }

    case 'cast': {
      return `『${anchorTitle}』と同じ出演者（${connection.name}）`;
    }

    case 'category': {
      return `『${anchorTitle}』と同じ${connection.name}の候補`;
    }
  }
}

export class WatchedRecommendationsService extends BaseService {
  async recommend(watchedUids: string[]): Promise<WatchedRecommendation[]> {
    const connections = await findMovieConnections(this.database, watchedUids);
    const byMovie = Map.groupBy(connections, connection => connection.movieUid);
    const showable = await loadShowableMovies(
      this.database,
      byMovie.keys().toArray(),
    );
    const availability = await loadMovieAvailabilityByMovie(
      this.database,
      showable.map(movie => movie.uid),
    );
    const strongest = (uid: string) =>
      byMovie
        .get(uid)!
        .toSorted(
          (a, b) =>
            KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
            a.anchorUid.localeCompare(b.anchorUid),
        )[0];
    const anchorCount = (uid: string) =>
      new Set(byMovie.get(uid)!.map(connection => connection.anchorUid)).size;
    const watchableRank = (uid: string) =>
      availability.get(uid)?.status === 'watchable' ? 1 : 0;
    const ranked = showable
      .map(movie => ({movie, reason: strongest(movie.uid)}))
      .toSorted(
        (a, b) =>
          watchableRank(b.movie.uid) - watchableRank(a.movie.uid) ||
          KIND_ORDER.indexOf(a.reason.kind) -
            KIND_ORDER.indexOf(b.reason.kind) ||
          anchorCount(b.movie.uid) - anchorCount(a.movie.uid) ||
          a.movie.uid.localeCompare(b.movie.uid),
      );
    const repeats = new Map<string, number>();
    const picked = ranked
      .map(item => {
        const repeat = repeats.get(item.reason.anchorUid) ?? 0;
        repeats.set(item.reason.anchorUid, repeat + 1);
        return {...item, repeat};
      })
      .toSorted(
        (a, b) =>
          watchableRank(b.movie.uid) - watchableRank(a.movie.uid) ||
          a.repeat - b.repeat,
      )
      .slice(0, MAX_RECOMMENDATIONS);
    const anchorTitles = await this.loadTitles(
      picked.map(item => item.reason.anchorUid),
    );

    return picked.map(({movie, reason}) => ({
      ...movie,
      reason: reasonOf(reason, anchorTitles.get(reason.anchorUid) ?? ''),
    }));
  }

  private async loadTitles(uids: string[]): Promise<Map<string, string>> {
    if (uids.length === 0) {
      return new Map();
    }

    const rows = await this.database
      .select({uid: movies.uid, title: localizedMovieTitle('ja')})
      .from(movies)
      .where(
        and(inArray(movies.uid, [...new Set(uids)]), isNull(movies.deletedAt)),
      );
    return new Map(rows.map(row => [row.uid, row.title ?? '']));
  }
}
