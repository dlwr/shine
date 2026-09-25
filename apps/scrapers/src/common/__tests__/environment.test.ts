import {describe, expect, it} from 'vitest';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  d1ProxyOf,
} from '../environment';

describe('assertDatabaseEnvironment', () => {
  it('ローカルのfile:データベースでは認証トークンを求めない', () => {
    const environment = buildEnvironment({
      TURSO_DATABASE_URL: 'file:/tmp/test.db',
    });

    expect(() => {
      assertDatabaseEnvironment(environment);
    }).not.toThrow();
  });

  it('リモートデータベースでは認証トークンを求める', () => {
    const environment = buildEnvironment({
      TURSO_DATABASE_URL: 'libsql://shine.turso.io',
    });

    expect(() => {
      assertDatabaseEnvironment(environment);
    }).toThrow(/TURSO_AUTH_TOKEN/);
  });

  it('接続先が無ければ失敗する', () => {
    const environment = buildEnvironment({TURSO_AUTH_TOKEN: 'token'});

    expect(() => {
      assertDatabaseEnvironment(environment);
    }).toThrow(/TURSO_DATABASE_URL/);
  });

  it('D1 の proxy があれば Turso の接続先を求めない', () => {
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
      TURSO_DATABASE_URL: 'file:/tmp/test.db',
      D1_PROXY_URL: 'https://proxy.example',
      D1_PROXY_KEY: 'key',
    });

    expect(d1ProxyOf(environment)).toBeUndefined();
  });
});
