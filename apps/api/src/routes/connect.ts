import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {ConnectService} from '../services/connect-service';
import {getSelectionDate} from '../services/selection-dates';
import {EdgeCache, IMPORTED_DATA_EDGE_TTL} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';
import {resolveClientIp} from '../utils/client-ip';
import type {MovieConnection} from '../types/connect';

export const connectRoutes = new Hono<{Bindings: Environment}>();

const CONNECTION_TTL = 3600;

connectRoutes.get('/', async c => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!from || !to || from === to) {
    return c.json({error: 'Two different movies are required'}, 400);
  }

  const cache = new EdgeCache(c.env.CACHE_KV);
  const cacheKey = `connect:${from}:${to}:v1`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json(cached.data as MovieConnection);
  }

  const attempt = await c.env.CONNECT_RATE_LIMITER?.limit({
    key: resolveClientIp(c),
  });
  if (attempt?.success === false) {
    return c.json({error: 'Too Many Requests'}, 429, {'Retry-After': '60'});
  }

  const connection = await new ConnectService(c.env).connect(from, to);
  if (!connection) {
    return c.json({error: 'Movie not found'}, 404);
  }

  await cache.set(cacheKey, connection, CONNECTION_TTL);
  return c.json(connection);
});

connectRoutes.get('/pick', async c => {
  const date = getSelectionDate(new Date(), 'daily');
  const {data, status} = await readThroughCache(
    c,
    new EdgeCache(c.env.CACHE_KV),
    {
      key: `connect-pick:${date}:v1`,
      ttl: 172_800,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => new ConnectService(c.env).pick(date),
    },
  );
  if (!data) {
    return c.json({error: 'No pair found'}, 404);
  }

  return c.json(data, 200, {'X-Cache-Status': status});
});

connectRoutes.get('/hops', async c => {
  const from = c.req.query('from');
  if (!from) {
    return c.json({error: 'A movie is required'}, 400);
  }

  const {data, status} = await readThroughCache(
    c,
    new EdgeCache(c.env.CACHE_KV),
    {
      key: `connect-hops:${from}:v1`,
      ttl: 604_800,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => new ConnectService(c.env).hops(from),
    },
  );
  if (!data) {
    return c.json({error: 'Movie not found'}, 404);
  }

  return c.json(data, 200, {'X-Cache-Status': status});
});
