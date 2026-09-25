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
  it('DATABASE_FILE_URLを読み取る', () => {
    const environment = buildEnvironment({
      DATABASE_FILE_URL: 'file:/tmp/shine.db',
    });

    expect(environment.DATABASE_FILE_URL).toBe('file:/tmp/shine.db');
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

  it('未設定のファイルの接続先は持たない', () => {
    const environment = buildEnvironment({});

    expect(environment.DATABASE_FILE_URL).toBeUndefined();
  });

  it('Turso の接続先は読まない', () => {
    const environment = buildEnvironment({
      TURSO_DATABASE_URL: 'file:/tmp/turso.db',
    });

    expect(environment.DATABASE_FILE_URL).toBeUndefined();
  });
});
