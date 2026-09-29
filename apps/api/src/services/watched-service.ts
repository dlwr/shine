import {and, eq, inArray, isNull} from '@shine/database';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import type {WatchedList} from '../types/awards';
import {
  resolveCategoryUids,
  summarizeCategories,
} from './award-category-queries';
import {awardPageDefinitions} from './award-definitions';
import type {AwardPageDefinition} from './award-definitions';
import {BaseService} from './base-service';

function compareWinnerOrder(
  a: {year: number; uid: string},
  b: {year: number; uid: string},
): number {
  return a.year - b.year || a.uid.localeCompare(b.uid);
}

export class WatchedService extends BaseService {
  async listWatchedLists(): Promise<WatchedList[]> {
    const definitions = awardPageDefinitions.filter(
      definition => definition.grouping === 'year' && !definition.subAward,
    );
    const lists = await Promise.all(
      definitions.map(async definition => this.watchedList(definition)),
    );

    return lists.filter(list => list !== undefined);
  }

  private async watchedList(
    definition: AwardPageDefinition,
  ): Promise<WatchedList | undefined> {
    const categoryUids = await resolveCategoryUids(this.database, definition);
    const [summary, winners] = await Promise.all([
      summarizeCategories(
        this.database,
        definition,
        definition.grouping,
        categoryUids,
      ),
      this.winners(categoryUids),
    ]);
    if (!summary) {
      return undefined;
    }

    const uids = winners.toSorted(compareWinnerOrder).map(winner => winner.uid);
    return {...summary, uids};
  }

  private async winners(
    categoryUids: string[],
  ): Promise<Array<{year: number; uid: string}>> {
    if (categoryUids.length === 0) {
      return [];
    }

    return this.database
      .selectDistinct({year: awardCeremonies.year, uid: movies.uid})
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          eq(nominations.isWinner, 1),
          isNull(movies.deletedAt),
        ),
      );
  }
}
