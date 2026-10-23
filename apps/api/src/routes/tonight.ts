import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {awardLegend} from '../services/award-tagged-movies';
import {TonightService} from '../services/tonight-service';
import type {TonightPick} from '../types/tonight';
import {EdgeCache, IMPORTED_DATA_EDGE_TTL} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const tonightRoutes = new Hono<{Bindings: Environment}>();

tonightRoutes.get('/', async c => {
  const {data: pool = []} = await readThroughCache(
    c,
    new EdgeCache(c.env.CACHE_KV),
    {
      key: 'tonight:pool:v1',
      ttl: 604_800,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => new TonightService(c.env).listPool(),
    },
  );
  const movie = pool[Math.floor(Math.random() * pool.length)];
  if (!movie) {
    return c.json({error: 'No movie found'}, 404);
  }

  const body: TonightPick = {
    movie,
    awards: awardLegend([movie]),
    poolSize: pool.length,
  };
  return c.json(body, 200, {'Cache-Control': 'no-store'});
});
