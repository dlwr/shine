import {describe, expect, it} from 'vitest';
import {assertDatabaseEnvironment, buildEnvironment} from './environment';

describe('buildEnvironment', () => {
  it('TURSO_DATABASE_URLを読み取る', () => {
    const environment = buildEnvironment({
      TURSO_DATABASE_URL: 'libsql://example.turso.io',
    });

    expect(environment.TURSO_DATABASE_URL).toBe('libsql://example.turso.io');
  });

  it('TURSO_AUTH_TOKENを読み取る', () => {
    const environment = buildEnvironment({TURSO_AUTH_TOKEN: 'token-abc'});

    expect(environment.TURSO_AUTH_TOKEN).toBe('token-abc');
  });

  it('TMDB_API_KEYを読み取る', () => {
    const environment = buildEnvironment({TMDB_API_KEY: 'tmdb-key'});

    expect(environment.TMDB_API_KEY).toBe('tmdb-key');
  });

  it('ADMIN_PASSWORDを読み取る', () => {
    const environment = buildEnvironment({ADMIN_PASSWORD: 'secret'});

    expect(environment.ADMIN_PASSWORD).toBe('secret');
  });

  it('JWT_SECRETを読み取る', () => {
    const environment = buildEnvironment({JWT_SECRET: 'jwt-secret'});

    expect(environment.JWT_SECRET).toBe('jwt-secret');
  });

  it('TURNSTILE_SECRET_KEYを読み取る', () => {
    const environment = buildEnvironment({TURNSTILE_SECRET_KEY: 'turnstile'});

    expect(environment.TURNSTILE_SECRET_KEY).toBe('turnstile');
  });

  it('未設定の項目は空文字になる', () => {
    const environment = buildEnvironment({});

    expect(environment.TURSO_DATABASE_URL).toBe('');
  });

  it('廃止された_DEVサフィックス付きの変数は読まない', () => {
    const environment = buildEnvironment({
      TURSO_DATABASE_URL_DEV: 'libsql://legacy.turso.io',
    });

    expect(environment.TURSO_DATABASE_URL).toBe('');
  });
});

describe('assertDatabaseEnvironment', () => {
  const valid = {
    TURSO_DATABASE_URL: 'libsql://example.turso.io',
    TURSO_AUTH_TOKEN: 'token-abc',
  };

  it('URLとトークンが揃っていれば通る', () => {
    expect(() => {
      assertDatabaseEnvironment(buildEnvironment(valid));
    }).not.toThrow();
  });

  it('URLが未設定なら例外を投げる', () => {
    expect(() => {
      assertDatabaseEnvironment(
        buildEnvironment({...valid, TURSO_DATABASE_URL: ''}),
      );
    }).toThrow(/TURSO_DATABASE_URL/);
  });

  it('トークンが未設定なら例外を投げる', () => {
    expect(() => {
      assertDatabaseEnvironment(
        buildEnvironment({...valid, TURSO_AUTH_TOKEN: ''}),
      );
    }).toThrow(/TURSO_AUTH_TOKEN/);
  });
});
