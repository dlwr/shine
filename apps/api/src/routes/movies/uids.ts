import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {MoviesService} from '../../services';
import {
  createCachedResponse,
  EdgeCache,
  getCacheTTL,
  IMPORTED_DATA_EDGE_TTL,
} from '../../utils/cache';
import {readThroughCache} from '../../utils/read-through-cache';

export const movieUidsRoutes = new Hono<{Bindings: Environment}>();

movieUidsRoutes.get('/uids', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data, status} = await readThroughCache(c, cache, {
    key: 'movies:uids:v1',
    ttl: getCacheTTL.movie.uids,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () => ({uids: await new MoviesService(c.env).listMovieUids()}),
  });

  return createCachedResponse(data, getCacheTTL.movie.uids, {
    'X-Cache-Status': status,
  });
});
