import {and, eq, isNull} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import type {ShiritoriEntry} from '../types/shiritori';
import {BaseService} from './base-service';
import {shiritoriEnds} from './shiritori';
import {loadMovieAvailabilityByMovie} from './watchable-availability';

export class ShiritoriService extends BaseService {
  async loadIndex(): Promise<ShiritoriEntry[]> {
    const rows = await this.database
      .select({
        uid: movies.uid,
        title: translations.content,
        year: movies.year,
      })
      .from(translations)
      .innerJoin(movies, eq(movies.uid, translations.resourceUid))
      .where(
        and(
          eq(translations.resourceType, 'movie_title'),
          eq(translations.languageCode, 'ja'),
          isNull(movies.deletedAt),
        ),
      )
      .orderBy(movies.uid);
    const candidates = rows.flatMap(row => {
      const ends = shiritoriEnds(row.title);
      return ends ? [{...row, ...ends}] : [];
    });
    const availability = await loadMovieAvailabilityByMovie(
      this.database,
      candidates.map(candidate => candidate.uid),
    );
    return candidates.map(({uid, title, year, first, last}) => ({
      uid,
      title,
      year: year ?? undefined,
      first,
      last,
      watchable: availability.get(uid)?.status === 'watchable',
    }));
  }
}
