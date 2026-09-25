import {createClient} from '@libsql/client';
import {drizzle as drizzleD1} from 'drizzle-orm/d1';
import {drizzle} from 'drizzle-orm/libsql';
import {drizzle as drizzleProxy} from 'drizzle-orm/sqlite-proxy';
import {sql, type SQL} from 'drizzle-orm';
import type {BatchItem} from 'drizzle-orm/batch';
import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';
import * as schema from './schema/index';

// Re-export drizzle-orm utilities
export {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  not,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
export type {SQL} from 'drizzle-orm';

export const stringLiteral = (value: string): SQL =>
  sql.raw(`'${value.replaceAll("'", "''")}'`);

export const D1_MAX_BOUND_PARAMETERS = 100;

type ChunkQuery<R> = PromiseLike<R[]> & {toSQL(): {params: unknown[]}};

export const inChunks = async <T, R>(
  values: readonly T[],
  build: (chunk: T[]) => ChunkQuery<R>,
): Promise<R[]> => {
  if (values.length === 0) {
    return [];
  }

  const otherParameters = build([values[0]]).toSQL().params.length - 1;
  const size = D1_MAX_BOUND_PARAMETERS - otherParameters;
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    chunks.push(values.slice(start, start + size));
  }

  const results = await Promise.all(chunks.map(async chunk => build(chunk)));
  return results.flat();
};

type ChunkStatement = PromiseLike<unknown> & {toSQL(): {params: unknown[]}};

export const runInChunks = async <T>(
  values: readonly T[],
  build: (chunk: T[]) => ChunkStatement,
): Promise<void> => {
  if (values.length === 0) {
    return;
  }

  const one = build([values[0]]).toSQL().params.length;
  const two = build([values[0], values[0]]).toSQL().params.length;
  const perValue = two - one;
  const size = Math.max(
    1,
    Math.floor((D1_MAX_BOUND_PARAMETERS - (one - perValue)) / perValue),
  );
  for (let start = 0; start < values.length; start += size) {
    await build(values.slice(start, start + size));
  }
};

export type Environment = {
  TMDB_API_KEY?: string;
  TMDB_LEAD_ACCESS_TOKEN?: string;
  OMDB_API_KEY?: string;
  DATABASE_FILE_URL?: string;
  ADMIN_PASSWORD?: string;
  JWT_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  QUIZ_ANSWER_KEY?: string;
  DISCORD_WEBHOOK_URL?: string;
  GITHUB_DISPATCH_TOKEN?: string;
  NORTH_STAR_OWNER_URL_PREFIXES?: string;
  NORTH_STAR_OWNER_IPS?: string;
  CACHE_KV?: KVNamespace;
  DB?: D1Database;
  D1_PROXY_URL?: string;
  D1_PROXY_KEY?: string;
  SUGGEST_RATE_LIMITER?: RateLimit;
  AVAILABILITY_RATE_LIMITER?: RateLimit;
  LOGIN_RATE_LIMITER?: RateLimit;
};

export type Database = BaseSQLiteDatabase<'async', unknown, typeof schema>;

export type WriteStatement = BatchItem<'sqlite'>;

type BatchCapableDatabase = {
  batch(statements: [WriteStatement, ...WriteStatement[]]): Promise<unknown>;
};

export const runBatch = async (
  database: Database,
  statements: WriteStatement[],
): Promise<void> => {
  const [first, ...rest] = statements;
  if (!first) {
    return;
  }

  await (database as unknown as BatchCapableDatabase).batch([first, ...rest]);
};

type ProxyConfig = {
  url: string;
  key: string;
  fetch?: typeof fetch;
};

const postToProxy = async (
  {url, key, fetch: fetchImpl = fetch}: ProxyConfig,
  body: unknown,
): Promise<unknown> => {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`D1 proxy ${response.status}: ${await response.text()}`);
  }

  return response.json();
};

export const createProxyDatabase = (config: ProxyConfig): Database =>
  drizzleProxy(
    async (query, parameters, method) =>
      postToProxy(config, {sql: query, params: parameters, method}) as Promise<{
        rows: unknown[];
      }>,
    async queries =>
      postToProxy(config, {batch: queries}) as Promise<
        Array<{rows: unknown[]}>
      >,
    {schema, casing: 'snake_case'},
  );

export const runStatementsOnProxy = async (
  config: ProxyConfig,
  statements: string[],
): Promise<void> => {
  await postToProxy(config, {
    batch: statements.map(statement => ({
      sql: statement,
      params: [],
      method: 'run',
    })),
  });
};

export const queryWithColumnNames = async (
  config: ProxyConfig,
  query: string,
): Promise<{columns: string[]; rows: unknown[][]}> => {
  const {rows} = (await postToProxy(config, {
    sql: query,
    params: [],
    method: 'all',
    columnNames: true,
  })) as {rows: unknown[][]};
  const [columns = [], ...values] = rows;
  return {columns: columns.map(String), rows: values};
};

export const getDatabase = (environment: Environment): Database => {
  if (environment.DB) {
    return drizzleD1(environment.DB, {schema, casing: 'snake_case'});
  }

  if (
    environment.D1_PROXY_URL &&
    !environment.DATABASE_FILE_URL?.startsWith('file:')
  ) {
    return createProxyDatabase({
      url: environment.D1_PROXY_URL,
      key: environment.D1_PROXY_KEY ?? '',
    });
  }

  if (!environment.DATABASE_FILE_URL?.startsWith('file:')) {
    throw new Error(
      'データベースの接続先がありません: D1_PROXY_URL か file: の DATABASE_FILE_URL を設定してください',
    );
  }

  const client = createClient({url: environment.DATABASE_FILE_URL});

  return drizzle({client, schema, casing: 'snake_case'});
};

export type Movie = typeof schema.movies.$inferSelect;
export type NewMovie = typeof schema.movies.$inferInsert;
export type Nomination = typeof schema.nominations.$inferSelect;
export type NewNomination = typeof schema.nominations.$inferInsert;
export type AwardCategory = typeof schema.awardCategories.$inferSelect;
export type NewAwardCategory = typeof schema.awardCategories.$inferInsert;
export type AwardCeremony = typeof schema.awardCeremonies.$inferSelect;
export type NewAwardCeremony = typeof schema.awardCeremonies.$inferInsert;
export type AwardOrganization = typeof schema.awardOrganizations.$inferSelect;
export type NewAwardOrganization =
  typeof schema.awardOrganizations.$inferInsert;
