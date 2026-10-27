import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {DoubleFeatureService} from '../services/double-feature-service';
import {getSelectionDate} from '../services/selection-dates';
import {EdgeCache, IMPORTED_DATA_EDGE_TTL} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const doubleFeatureRoutes = new Hono<{Bindings: Environment}>();

doubleFeatureRoutes.get('/', async c => {
  const date = getSelectionDate(new Date(), 'daily');
  const {data, status} = await readThroughCache(
    c,
    new EdgeCache(c.env.CACHE_KV),
    {
      key: `double-feature:${date}:v1`,
      ttl: 172_800,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => new DoubleFeatureService(c.env).getDoubleFeature(date),
    },
  );
  if (!data) {
    return c.json({error: 'No double feature found'}, 404);
  }

  return c.json(data, 200, {'X-Cache-Status': status});
});
