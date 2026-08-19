import path from 'node:path';
import process from 'node:process';
import {config} from 'dotenv';
import {type Environment} from '@shine/database';

/**
 * .env / .dev.vars を探索して読み込む。
 * CLI は apps/scrapers を cwd として起動されるため、リポジトリルートも見る。
 */
export function loadEnvironmentFiles(): void {
  config();
  config({path: path.resolve(process.cwd(), '.dev.vars')});
  config({path: path.resolve(process.cwd(), '../../.env')});
  config({path: path.resolve(process.cwd(), '../../.dev.vars')});
}

export function buildEnvironment(source: NodeJS.ProcessEnv): Environment {
  return {
    TURSO_DATABASE_URL: source.TURSO_DATABASE_URL ?? '',
    TURSO_AUTH_TOKEN: source.TURSO_AUTH_TOKEN ?? '',
    TMDB_API_KEY: source.TMDB_API_KEY ?? '',
    TMDB_LEAD_ACCESS_TOKEN: source.TMDB_LEAD_ACCESS_TOKEN ?? '',
    OMDB_API_KEY: source.OMDB_API_KEY ?? '',
    ADMIN_PASSWORD: source.ADMIN_PASSWORD ?? '',
    JWT_SECRET: source.JWT_SECRET ?? '',
    TURNSTILE_SECRET_KEY: source.TURNSTILE_SECRET_KEY ?? '',
  };
}

export function assertDatabaseEnvironment(environment: Environment): void {
  const isLocalFileDatabase =
    environment.TURSO_DATABASE_URL.startsWith('file:');
  const missing = [
    environment.TURSO_DATABASE_URL ? undefined : 'TURSO_DATABASE_URL',
    isLocalFileDatabase || environment.TURSO_AUTH_TOKEN
      ? undefined
      : 'TURSO_AUTH_TOKEN',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `データベース接続情報が不足しています: ${missing.join(', ')} を .env または .dev.vars に設定してください。`,
    );
  }
}

/**
 * .env を読み込んだうえで Environment を組み立て、DB接続情報の有無を検証する。
 */
export function loadScraperEnvironment(): Environment {
  loadEnvironmentFiles();
  const environment = buildEnvironment(process.env);
  assertDatabaseEnvironment(environment);
  return environment;
}
