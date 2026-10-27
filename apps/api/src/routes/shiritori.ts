import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {getSelectionDate} from '../services/selection-dates';
import {buildChain, pickDailyChain} from '../services/shiritori';
import {ShiritoriService} from '../services/shiritori-service';
import type {ShiritoriChain} from '../types/shiritori';
import {EdgeCache, IMPORTED_DATA_EDGE_TTL} from '../utils/cache';
import {simpleHash} from '../utils/hash';
import {readThroughCache} from '../utils/read-through-cache';

export const shiritoriRoutes = new Hono<{Bindings: Environment}>();

shiritoriRoutes.get('/', async c => {
  const from = c.req.query('from');
  const {data: index = [], status} = await readThroughCache(
    c,
    new EdgeCache(c.env.CACHE_KV),
    {
      key: 'shiritori:index:v1',
      ttl: 604_800,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => new ShiritoriService(c.env).loadIndex(),
    },
  );
  const date = getSelectionDate(new Date(), 'daily');
  const links = from
    ? buildChain(index, from, simpleHash(`${date}-${from}`))
    : pickDailyChain(index, date);
  if (links.length === 0) {
    return c.json({error: 'No chain found'}, 404);
  }

  const body: ShiritoriChain = {date, from, links};
  return c.json(body, 200, {'X-Cache-Status': status});
});
