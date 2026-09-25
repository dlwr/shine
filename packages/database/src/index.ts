import {createClient} from '@libsql/client';
import {drizzle as drizzleD1} from 'drizzle-orm/d1';
import {drizzle} from 'drizzle-orm/libsql';
import {sql, type SQL} from 'drizzle-orm';
import type {BatchItem} from 'drizzle-orm/batch';
import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';
import * as schema from './schema/index';
import {createTimeoutFetch, resolveRequestTimeout} from './timeout-fetch';

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
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  TURSO_REQUEST_TIMEOUT_MS?: string;
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

export const getDatabase = (environment: Environment): Database => {
  if (environment.DB) {
    return drizzleD1(environment.DB, {schema, casing: 'snake_case'});
  }

  const requestTimeoutMs = resolveRequestTimeout(
    environment.TURSO_REQUEST_TIMEOUT_MS,
  );
  const client = createClient({
    url: environment.TURSO_DATABASE_URL,
    authToken: environment.TURSO_AUTH_TOKEN,
    ...(requestTimeoutMs && {fetch: createTimeoutFetch(requestTimeoutMs)}),
  });

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
