import {type Environment} from '@shine/database';
import {EdgeCache, getCacheKeyForRelatedMovies} from '../utils/cache';
import {AdminSelectionsService} from './admin-selections-service';

export async function invalidateMovieCaches(
  environment: Environment,
  movieUid: string,
): Promise<void> {
  const cache = new EdgeCache(environment.CACHE_KV);
  await cache.delete(getCacheKeyForRelatedMovies(movieUid));
  await new AdminSelectionsService(environment).purgeSelectionCachesForMovie(
    movieUid,
  );
}
