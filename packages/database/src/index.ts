import {createClient} from '@libsql/client';
import {drizzle as drizzleD1} from 'drizzle-orm/d1';
import {drizzle} from 'drizzle-orm/libsql';
import {drizzle as drizzleProxy} from 'drizzle-orm/sqlite-proxy';
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
  D1_PROXY_URL?: string;
  D1_PROXY_KEY?: string;
  SUGGEST_RATE_LIMITER?: RateLimit;
  AVAILABILITY_RATE_LIMITER?: RateLimit;
  LOGIN_RATE_LIMITER?: RateLimit;
};

export const getDatabase = (environment: Environment) => {
  if (environment.DB) {
    return drizzleD1(environment.DB, {
      schema: {
        ...schema,
      },
      casing: 'snake_case',
    }) as unknown as ReturnType<typeof getLibsqlDatabase>;
  }

  if (environment.D1_PROXY_URL) {
    const proxyUrl = environment.D1_PROXY_URL;
    const post = async (body: unknown) => {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${environment.D1_PROXY_KEY ?? ''}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(
          `D1 proxy ${response.status}: ${await response.text()}`,
        );
      }

      return response.json();
    };

    return drizzleProxy(
      async (sql, parameters, method) =>
        post({sql, params: parameters, method}) as Promise<{rows: unknown[]}>,
      async queries =>
        post({batch: queries}) as Promise<Array<{rows: unknown[]}>>,
      {schema: {...schema}, casing: 'snake_case'},
    ) as unknown as ReturnType<typeof getLibsqlDatabase>;
  }

  return getLibsqlDatabase(environment);
};

const getLibsqlDatabase = (environment: Environment) => {
  const requestTimeoutMs = resolveRequestTimeout(
    environment.TURSO_REQUEST_TIMEOUT_MS,
  );
  const client = createClient({
    url: environment.TURSO_DATABASE_URL,
    authToken: environment.TURSO_AUTH_TOKEN,
    ...(requestTimeoutMs && {fetch: createTimeoutFetch(requestTimeoutMs)}),
  });

  return drizzle({
    client,
    schema: {
      ...schema,
    },
    casing: 'snake_case',
  });
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
