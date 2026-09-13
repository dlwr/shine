import type {WatchedList} from '@shine/types';
import {AwardsService} from './awards-service';
import {BaseService} from './base-service';

function compareWinnerOrder(
  a: {year: number; uid: string},
  b: {year: number; uid: string},
): number {
  return a.year - b.year || a.uid.localeCompare(b.uid);
}

export class WatchedService extends BaseService {
  async listWatchedLists(): Promise<WatchedList[]> {
    const awardsService = new AwardsService(this.env);
    const awards = await awardsService.listAwards();
    const summaries = awards.filter(
      summary => summary.grouping === 'year' && !summary.subAward,
    );
    const lists: WatchedList[] = [];

    for (const summary of summaries) {
      const detail = await awardsService.getAwardBySlug(summary.slug);
      if (!detail) {
        continue;
      }

      const uids = detail.years
        .flatMap(group =>
          group.movies
            .filter(movie => movie.isWinner)
            .map(movie => ({year: group.year, uid: movie.uid})),
        )
        .toSorted(compareWinnerOrder)
        .map(entry => entry.uid);
      lists.push({...summary, uids});
    }

    return lists;
  }
}
