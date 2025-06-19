import { SignJWT, jwtVerify } from 'jose';
import type { Context } from 'hono';
import type { Environment } from '../../src';

const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRATION = '24h';

export async function createJWT(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);
  
  const jwt = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(secretKey);
    
  return jwt;
}

export async function verifyJWT(token: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const secretKey = encoder.encode(secret);
    
    await jwtVerify(token, secretKey);
    return true;
  } catch {
    return false;
  }
}

export async function authMiddleware(c: Context<{ Bindings: Environment }>, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  if (!c.env.JWT_SECRET) {
    return c.json({ error: 'JWT_SECRET not configured' }, 500);
  }
  
  const token = authHeader.slice(7);
  const isValid = await verifyJWT(token, c.env.JWT_SECRET);
  
  if (!isValid) {
    return c.json({ error: 'Invalid token' }, 401);
  }
  
  await next();
}