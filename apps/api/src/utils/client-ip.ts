import type {Context} from 'hono';

export function resolveClientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || 'unknown'
  );
}
