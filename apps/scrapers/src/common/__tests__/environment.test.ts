import {describe, expect, it, vi} from 'vitest';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  d1ProxyOf,
} from '../environment';

describe('loadEnvironmentFiles', () => {
  it('dotenv の宣伝ログを出さない', async () => {
    vi.resetModules();
    vi.doMock('dotenv', () => ({config: vi.fn()}));
    const {config} = await import('dotenv');
    const {loadEnvironmentFiles} = await import('../environment');

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
});

describe('assertDatabaseEnvironment', () => {
  it('ローカルのfile:データベースでは認証トークンを求めない', () => {
    const environment = buildEnvironment({
      DATABASE_FILE_URL: 'file:/tmp/test.db',
    });

    expect(() => {
      assertDatabaseEnvironment(environment);
    }).not.toThrow();
  });

  it('file: でない接続先は受け付けない', () => {
    const environment = buildEnvironment({
      DATABASE_FILE_URL: 'libsql://shine.turso.io',
    });

    expect(() => {
      assertDatabaseEnvironment(environment);
    }).toThrow(/D1_PROXY_URL/);
  });

  it('接続先が無ければ失敗する', () => {
    const environment = buildEnvironment({});

    expect(() => {
      assertDatabaseEnvironment(environment);
    }).toThrow(/D1_PROXY_URL/);
  });

  it('D1 の proxy があればファイルの接続先を求めない', () => {
    const environment = buildEnvironment({
      D1_PROXY_URL: 'https://shine-database-proxy.example.workers.dev',
      D1_PROXY_KEY: 'key',
    });

    expect(() => {
      assertDatabaseEnvironment(environment);
    }).not.toThrow();
  });

  it('D1 の proxy の鍵が無ければ失敗する', () => {
    const environment = buildEnvironment({
      D1_PROXY_URL: 'https://shine-database-proxy.example.workers.dev',
    });

    expect(() => {
      assertDatabaseEnvironment(environment);
    }).toThrow(/D1_PROXY_KEY/);
  });
});

describe('d1ProxyOf', () => {
  it('D1 の proxy の接続先を返す', () => {
    const environment = buildEnvironment({
      D1_PROXY_URL: 'https://proxy.example',
      D1_PROXY_KEY: 'key',
    });

    expect(d1ProxyOf(environment)).toEqual({
      url: 'https://proxy.example',
      key: 'key',
    });
  });

  it('ローカルの file: データベースが指定されていれば proxy を使わない', () => {
    const environment = buildEnvironment({
      DATABASE_FILE_URL: 'file:/tmp/test.db',
      D1_PROXY_URL: 'https://proxy.example',
      D1_PROXY_KEY: 'key',
    });

    expect(d1ProxyOf(environment)).toBeUndefined();
  });
});
