import {and, eq, isNull, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import type {AwardTaggedMovie} from '../types/award-tagged-movies';
import type {LanguageSummary} from '../types/languages';
import {awardPageNominations} from './award-definition-lookup';
import {loadAwardTaggedMovies} from './award-tagged-movies';
import {BaseService} from './base-service';

export class LanguagesService extends BaseService {
  async listLanguages(): Promise<LanguageSummary[]> {
    const rows = await this.database
      .select({
        code: movies.originalLanguage,
        movieCount: sql<number>`COUNT(DISTINCT ${movies.uid})`,
      })
      .from(movies)
      .innerJoin(nominations, eq(nominations.movieUid, movies.uid))
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardCeremonies.organizationUid, awardOrganizations.uid),
      )
      .innerJoin(
        awardCategories,
        eq(nominations.categoryUid, awardCategories.uid),
      )
      .where(and(isNull(movies.deletedAt), awardPageNominations()))
      .groupBy(movies.originalLanguage);

    return rows.toSorted(
      (a, b) => b.movieCount - a.movieCount || a.code.localeCompare(b.code),
    );
  }

  async getLanguageMovies(code: string): Promise<AwardTaggedMovie[]> {
    const result = await loadAwardTaggedMovies(
      this.database,
      eq(movies.originalLanguage, code),
    );

    return result.movies.toSorted(
      (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.uid.localeCompare(b.uid),
    );
  }
}
