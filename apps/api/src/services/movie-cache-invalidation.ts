import {type Environment} from '@shine/database';
import {
  CACHEABLE_LOCALES,
  EdgeCache,
  getCacheKeyForRelatedMovies,
} from '../utils/cache';
import {AdminSelectionsService} from './admin-selections-service';

export async function invalidateMovieCaches(
  environment: Environment,
  movieUid: string,
): Promise<void> {
  const cache = new EdgeCache(undefined, environment.CACHE_KV);
  await Promise.all(
    CACHEABLE_LOCALES.map(async locale =>
      cache.delete(getCacheKeyForRelatedMovies(movieUid, locale)),
    ),
  );
  await new AdminSelectionsService(environment).purgeSelectionCachesForMovie(
    movieUid,
  );
}
