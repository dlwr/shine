import type {Context, Next} from 'hono';

export const requestLogging = async (c: Context, next: Next) => {
  const start = Date.now();
  await next();

  const cacheStatus = c.res.headers.get('X-Cache-Status') ?? undefined;
  console.log(
    JSON.stringify({
      event: 'request',
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ...(cacheStatus !== undefined && {cacheStatus}),
      durationMs: Date.now() - start,
    }),
  );
};
