import {type Environment} from '@shine/database';
import {EdgeCache, getMovieCacheKeysForAllLocales} from '../utils/cache';
import {SelectionsService} from './selections-service';

export async function invalidateMovieDetailsCache(
  environment: Environment,
  movieUid: string,
): Promise<void> {
  const cache = new EdgeCache(undefined, environment.CACHE_KV);
  await Promise.all(
    getMovieCacheKeysForAllLocales(movieUid).map(async key =>
      cache.delete(key),
    ),
  );
}

export async function invalidateMovieCaches(
  environment: Environment,
  movieUid: string,
): Promise<void> {
  await invalidateMovieDetailsCache(environment, movieUid);
  await new SelectionsService(environment).purgeSelectionCachesForMovie(
    movieUid,
  );
}
