import {SignJWT} from 'jose';
import {describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import app from '../index';

const JWT_SECRET = 'test-jwt-secret';

const environment = {
  JWT_SECRET,
} as never;

describe('admin routes authentication (via app.request)', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const response = await app.request('/admin/movies', {}, environment);

    expect(response.status).toBe(401);
    const body = (await response.json()) as {
      code: string;
      details: {reason: string};
    };
    expect(body.code).toBe('AUTHENTICATION_ERROR');
    expect(body.details.reason).toBe('MISSING_TOKEN');
  });

  it('returns 401 when token is invalid', async () => {
    const response = await app.request(
      '/admin/movies',
      {headers: {Authorization: 'Bearer invalid-token'}},
      environment,
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as {
      code: string;
      details: {reason: string};
    };
    expect(body.code).toBe('AUTHENTICATION_ERROR');
    expect(body.details.reason).toBe('INVALID_TOKEN');
  });

  it('returns 401 when token is expired', async () => {
    const secretKey = new TextEncoder().encode(JWT_SECRET);
    const expiredToken = await new SignJWT({role: 'admin'})
      .setProtectedHeader({alg: 'HS256'})
      .setIssuedAt()
      .setExpirationTime('-1s')
      .sign(secretKey);

    const response = await app.request(
      '/admin/movies',
      {headers: {Authorization: `Bearer ${expiredToken}`}},
      environment,
    );

    expect(response.status).toBe(401);
  });
});

describe('createJWT', () => {
  it('issues tokens with an expiration time', async () => {
    const token = await createJWT(JWT_SECRET);
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    ) as {exp?: number; iat?: number};

    expect(payload.exp).toBeDefined();
    expect(payload.exp).toBeGreaterThan(payload.iat!);
  });
});
