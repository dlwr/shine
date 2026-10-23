import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {awardLegend} from '../services/award-tagged-movies';
import {TonightService} from '../services/tonight-service';
import type {TonightPick} from '../types/tonight';
import {EdgeCache, IMPORTED_DATA_EDGE_TTL} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const tonightRoutes = new Hono<{Bindings: Environment}>();

const MAX_RUNTIME_CHOICES = new Set([60, 90, 120]);

tonightRoutes.get('/', async c => {
  const maxRuntime = Number(c.req.query('max') ?? '90');
  if (!MAX_RUNTIME_CHOICES.has(maxRuntime)) {
    return c.json({error: 'Runtime not found'}, 404);
  }

  const {data: pool = []} = await readThroughCache(
    c,
    new EdgeCache(c.env.CACHE_KV),
    {
      key: `tonight:pool:${maxRuntime}:v1`,
      ttl: 604_800,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => new TonightService(c.env).listPool(maxRuntime),
    },
  );
  const movie = pool[Math.floor(Math.random() * pool.length)];
  if (!movie) {
    return c.json({error: 'No movie found'}, 404);
  }

  const body: TonightPick = {
    movie,
    awards: awardLegend([movie]),
    maxRuntime,
    poolSize: pool.length,
  };
  return c.json(body, 200, {'Cache-Control': 'no-store'});
});
