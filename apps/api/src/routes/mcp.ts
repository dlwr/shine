import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {resolveClientIp} from '../utils/client-ip';
import {createInMemoryRateLimit} from '../utils/request-rate-limit';

export const mcpRoutes = new Hono<{Bindings: Environment}>();

const isMcpRateLimited = createInMemoryRateLimit({
  limit: 60,
  windowMs: 60 * 1000,
});

async function isBatchBody(request: Request): Promise<boolean> {
  try {
    return Array.isArray(await request.clone().json());
  } catch {
    return false;
  }
}

mcpRoutes.all('/', async c => {
  if (c.env.MCP_DISABLED === 'true') {
    return c.json({error: 'MCP server is disabled'}, 503);
  }

  if (isMcpRateLimited(resolveClientIp(c))) {
    return c.json({error: 'Too Many Requests'}, 429, {'Retry-After': '60'});
  }

  if (c.req.method === 'POST' && (await isBatchBody(c.req.raw))) {
    return c.json({error: 'JSON-RPC batch is not supported'}, 400);
  }

  const {serveMcp} = await import('./mcp-server');
  return serveMcp(c);
});
