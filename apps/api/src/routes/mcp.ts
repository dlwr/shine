import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {resolveClientIp} from '../utils/client-ip';
import {createInMemoryRateLimit} from '../utils/request-rate-limit';

export const mcpRoutes = new Hono<{Bindings: Environment}>();

const isMcpRateLimited = createInMemoryRateLimit({
  limit: 60,
  windowMs: 60 * 1000,
});

mcpRoutes.all('/', async c => {
  if (c.env.MCP_DISABLED === 'true') {
    return c.json({error: 'MCP server is disabled'}, 503);
  }

  if (isMcpRateLimited(resolveClientIp(c))) {
    return c.json({error: 'Too Many Requests'}, 429, {'Retry-After': '60'});
  }

  const {serveMcp} = await import('./mcp-server');
  return serveMcp(c);
});
