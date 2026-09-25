import {describe, expect, it, vi} from 'vitest';
import {buildEnvironment} from './environment';

describe('loadEnvironmentFiles', () => {
  it('dotenv の宣伝ログを出さない', async () => {
    vi.resetModules();
    vi.doMock('dotenv', () => ({config: vi.fn()}));
    const {config} = await import('dotenv');
    const {loadEnvironmentFiles} = await import('./environment');

    loadEnvironmentFiles();

    expect(config).toHaveBeenCalledWith(expect.objectContaining({quiet: true}));
    vi.doUnmock('dotenv');
  });
});

describe('buildEnvironment', () => {
  it('TURSO_DATABASE_URLを読み取る', () => {
    const environment = buildEnvironment({
      TURSO_DATABASE_URL: 'libsql://example.turso.io',
    });

    expect(environment.TURSO_DATABASE_URL).toBe('libsql://example.turso.io');
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
