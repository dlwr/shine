import {createClient} from '@libsql/client';
import {drizzle as drizzleD1} from 'drizzle-orm/d1';
import {drizzle} from 'drizzle-orm/libsql';
import {sql, type SQL} from 'drizzle-orm';
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
