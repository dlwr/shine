import {describe, expect, it} from 'vitest';
import {assertDatabaseEnvironment, buildEnvironment} from '../environment';

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
});
