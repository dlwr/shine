import {
  createMcpHandler,
  hostHeaderValidationResponse,
  McpServer,
  originValidationResponse,
  type CallToolResult,
} from '@modelcontextprotocol/server';
import {getDatabase, inArray, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import type {Context} from 'hono';
import * as z from 'zod';
import {sanitizeText} from '../middleware/sanitizer';
import {loadAwardTaggedMovies} from '../services/award-tagged-movies';
import {MoviesService} from '../services/movies-service';
import {loadMovieAvailabilityByMovie} from '../services/watchable-availability';
import {EdgeCache, getCacheTTL, writeCacheAfterResponse} from '../utils/cache';
import {readAwardList, readAwardYear} from './awards';

type McpContext = Context<{Bindings: Environment}>;
type Locale = 'ja' | 'en';

const SITE = 'https://shine-film.com';
const ALLOWED_HOSTNAMES = ['shine-film.com', 'localhost', '127.0.0.1'];
const SEARCH_LIMIT = 10;
const AWARD_YEAR_MOVIE_LIMIT = 50;

const NOTICE =
  'Best-effort and read-only: tool names, arguments and response shapes may change without notice.';

const localeSchema = z
  .enum(['ja', 'en'])
  .default('ja')
  .describe(
    'ja (default) or en. en returns English titles, award names, cast names and synopsis in get_movie where available; elsewhere titles and award names stay mostly Japanese. Page URLs point to the English site.',
  );

const availabilityDescription =
  'japanAvailability is one of watchable (streaming or rental in Japan confirmed), rental_only (only DISCAS mail rental matched, needs manual confirmation), unwatchable, unchecked.';

function pageUrl(path: string, locale: Locale): string {
  return locale === 'en' ? `${SITE}${path}?locale=en` : `${SITE}${path}`;
}

function json(data: unknown): CallToolResult {
  return {content: [{type: 'text', text: JSON.stringify(data)}]};
}

function failure(message: string): CallToolResult {
  return {content: [{type: 'text', text: message}], isError: true};
}

type SearchedMovie = {
  uid: string;
  title: string;
  year: number | undefined;
  originalLanguage: string;
  awards: Array<{
    slug: string;
    name: string | undefined;
    organization: string | undefined;
    isWinner: boolean;
  }>;
  japanAvailability: string;
};

type SearchResult = {totalCount: number; movies: SearchedMovie[]};

async function searchMovies(
  c: McpContext,
  query: string,
): Promise<SearchResult> {
  const cache = new EdgeCache(c.env.CACHE_KV);
  const cacheKey = `mcp:search:${query}:v1`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached.data as SearchResult;
  }

  const {movies: found, pagination} = await new MoviesService(
    c.env,
  ).searchMovies({page: 1, limit: SEARCH_LIMIT, query, matchPeople: false});
  const uids = found.map(movie => movie.uid);
  const database = getDatabase(c.env);
  const [tagged, availability] = await Promise.all([
    uids.length > 0
      ? loadAwardTaggedMovies(database, inArray(movies.uid, uids))
      : {movies: [], awards: []},
    loadMovieAvailabilityByMovie(database, uids),
  ]);
  const legends = new Map(tagged.awards.map(award => [award.slug, award]));
  const awardsByMovie = new Map(
    tagged.movies.map(movie => [movie.uid, movie.awards]),
  );

  const result: SearchResult = {
    totalCount: pagination.totalCount,
    movies: found.map(movie => ({
      uid: movie.uid,
      title: movie.title,
      year: movie.year,
      originalLanguage: movie.originalLanguage,
      awards: (awardsByMovie.get(movie.uid) ?? []).map(award => ({
        slug: award.slug,
        name: legends.get(award.slug)?.name,
        organization: legends.get(award.slug)?.organization,
        isWinner: award.isWinner,
      })),
      japanAvailability: availability.get(movie.uid)?.status ?? 'unchecked',
    })),
  };
  await writeCacheAfterResponse(
    c,
    cache.set(cacheKey, result, getCacheTTL.search.results),
  );
  return result;
}

async function getMovie(
  c: McpContext,
  uid: string,
  locale: Locale,
): Promise<CallToolResult> {
  let movie;
  try {
    movie = await new MoviesService(c.env).getMovieDetails(uid, locale);
  } catch (error) {
    if (error instanceof Error && error.message === 'Movie not found') {
      return failure(`Movie not found: ${uid}`);
    }

    throw error;
  }

  const availabilityByMovie = await loadMovieAvailabilityByMovie(
    getDatabase(c.env),
    [uid],
  );
  const availability = availabilityByMovie.get(uid);

  return json({
    uid: movie.uid,
    title: movie.title,
    year: movie.year,
    runtime: movie.runtime,
    releaseDate: movie.releaseDate,
    originalLanguage: movie.originalLanguage,
    description: movie.description,
    imdbUrl: movie.imdbUrl,
    url: pageUrl(`/movies/${movie.uid}`, locale),
    japanAvailability: {
      status: availability?.status ?? 'unchecked',
      sources: (availability?.watchable ?? []).map(source => ({
        source: source.source,
        detail: source.detail,
      })),
    },
    nominations: movie.nominations.map(nomination => ({
      ceremonyYear: nomination.ceremony.year,
      organization:
        nomination.organization.displayName ?? nomination.organization.name,
      category: nomination.category.displayName ?? nomination.category.name,
      isWinner: nomination.isWinner,
      specialMention: nomination.specialMention,
      person: nomination.person?.name,
      awardSlug: nomination.organization.slug,
    })),
    credits: {
      directors: (movie.credits?.crew ?? [])
        .filter(member => member.job === 'Director')
        .map(member => member.name),
      cast: (movie.credits?.cast ?? []).map(member => ({
        name: member.name,
        character: member.character,
        url: pageUrl(`/people/${member.uid}`, locale),
      })),
    },
  });
}

function createServer(c: McpContext): McpServer {
  const server = new McpServer({name: 'shine-film', version: '0.1.0'});

  server.registerTool(
    'search_movies',
    {
      title: 'Search movies',
      description: `Search SHINE (shine-film.com), a database of award-winning and nominated films, by Japanese or original title. Returns up to ${SEARCH_LIMIT} movies (oldest first) with their major awards and whether they can be watched in Japan. ${availabilityDescription} Use get_movie with a uid for details. ${NOTICE}`,
      inputSchema: z.object({
        query: z
          .string()
          .min(2)
          .max(50)
          .describe('Title or part of a title, at least 2 characters.'),
        locale: localeSchema,
      }),
      annotations: {readOnlyHint: true, openWorldHint: false},
    },
    async ({query, locale}) => {
      const normalized = sanitizeText(query).replaceAll(/\s+/g, ' ');
      if (normalized.length < 2) {
        return failure('query must be at least 2 characters');
      }

      const result = await searchMovies(c, normalized);
      return json({
        totalCount: result.totalCount,
        searchUrl: pageUrl(
          `/search?q=${encodeURIComponent(normalized)}`,
          locale,
        ),
        movies: result.movies.map(movie => ({
          ...movie,
          url: pageUrl(`/movies/${movie.uid}`, locale),
        })),
      });
    },
  );

  server.registerTool(
    'get_movie',
    {
      title: 'Get movie details',
      description: `Get one movie from SHINE (shine-film.com) by uid: awards and nominations, director and top-billed cast, and whether it can be watched in Japan with the confirmed sources. ${availabilityDescription} ${NOTICE}`,
      inputSchema: z.object({
        uid: z
          .string()
          .min(1)
          .max(64)
          .describe('Movie uid from search_movies or get_award_year.'),
        locale: localeSchema,
      }),
      annotations: {readOnlyHint: true, openWorldHint: false},
    },
    async ({uid, locale}) => getMovie(c, uid, locale),
  );

  server.registerTool(
    'list_awards',
    {
      title: 'List awards',
      description: `List the awards and film lists SHINE (shine-film.com) covers, with slugs. Awards with hasYearPages true can be passed to get_award_year. Names are in Japanese. ${NOTICE}`,
      inputSchema: z.object({locale: localeSchema}),
      annotations: {readOnlyHint: true, openWorldHint: false},
    },
    async ({locale}) => {
      const {data} = await readAwardList(c, new EdgeCache(c.env.CACHE_KV));
      return json({
        awards: (data?.awards ?? []).map(award => ({
          slug: award.slug,
          name: award.name,
          organization: award.organization,
          grouping: award.grouping,
          hasYearPages: award.grouping === 'year',
          firstYear: award.firstYear,
          lastYear: award.lastYear,
          url: pageUrl(`/awards/${award.slug}`, locale),
        })),
      });
    },
  );

  server.registerTool(
    'get_award_year',
    {
      title: 'Get award year',
      description: `Get the winners and nominees of one award in one ceremony year from SHINE (shine-film.com), with whether each movie can be watched in Japan. Use a slug from list_awards with hasYearPages true; year is the ceremony year. Returns at most ${AWARD_YEAR_MOVIE_LIMIT} movies. Titles are Japanese where available. ${availabilityDescription} ${NOTICE}`,
      inputSchema: z.object({
        slug: z
          .string()
          .regex(/^[a-z\d-]{1,64}$/)
          .describe('Award slug from list_awards, e.g. academy-best-picture.'),
        year: z.number().int().min(1900).max(2100).describe('Ceremony year.'),
        locale: localeSchema,
      }),
      annotations: {readOnlyHint: true, openWorldHint: false},
    },
    async ({slug, year, locale}) => {
      const cache = new EdgeCache(c.env.CACHE_KV);
      const {data: list} = await readAwardList(c, cache);
      const award = list?.awards.find(entry => entry.slug === slug);
      if (award?.grouping !== 'year') {
        return failure(
          `Unknown award slug or no year pages: ${slug}. Use list_awards.`,
        );
      }

      const {data} = await readAwardYear(c, cache, slug, year);
      if (!data) {
        return failure(`No ceremony for ${slug} in ${year}.`);
      }

      return json({
        slug: data.slug,
        name: data.name,
        organization: data.organization,
        year: data.year,
        ceremonyNumber: data.ceremonyNumber,
        previousYear: data.previousYear,
        nextYear: data.nextYear,
        url: pageUrl(`/awards/${data.slug}/${data.year}`, locale),
        availabilitySummary: data.availabilitySummary,
        movieCount: data.movies.length,
        movies: data.movies.slice(0, AWARD_YEAR_MOVIE_LIMIT).map(movie => ({
          uid: movie.uid,
          title: movie.title,
          movieYear: movie.movieYear,
          isWinner: movie.isWinner,
          specialMention: movie.specialMention,
          japanAvailability: movie.availabilityStatus,
          url: pageUrl(`/movies/${movie.uid}`, locale),
        })),
      });
    },
  );

  return server;
}

export async function serveMcp(c: McpContext): Promise<Response> {
  const request = c.req.raw;
  const rejected =
    hostHeaderValidationResponse(request, ALLOWED_HOSTNAMES) ??
    originValidationResponse(request, ALLOWED_HOSTNAMES);
  if (rejected) {
    return rejected;
  }

  return createMcpHandler(() => createServer(c)).fetch(request);
}
