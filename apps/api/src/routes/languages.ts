import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {awardLegend} from '../services/award-tagged-movies';
import {LanguagesService} from '../services/languages-service';
import type {LanguagePage} from '../types/languages';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  IMPORTED_DATA_EDGE_TTL,
  shouldCheckETag,
} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const languagesRoutes = new Hono<{Bindings: Environment}>();

const LANGUAGES_CACHE_TTL = 604_800;
const PAGE_SIZE = 100;

languagesRoutes.get('/', async c => {
  const {data, status} = await readThroughCache(
    c,
    new EdgeCache(c.env.CACHE_KV),
    {
      key: 'languages:v1',
      ttl: LANGUAGES_CACHE_TTL,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => new LanguagesService(c.env).listLanguages(),
    },
  );

  return createCachedResponse(data, LANGUAGES_CACHE_TTL, {
    'X-Cache-Status': status,
  });
});

languagesRoutes.get('/:code', async c => {
  const cache = new EdgeCache(c.env.CACHE_KV);
  const {data: languages} = await readThroughCache(c, cache, {
    key: 'languages:v1',
    ttl: LANGUAGES_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () => new LanguagesService(c.env).listLanguages(),
  });
  const language = (languages ?? []).find(
    entry => entry.code === c.req.param('code'),
  );
  const page = Number(c.req.query('page') ?? '1');
  const pageCount = Math.ceil((language?.movieCount ?? 0) / PAGE_SIZE);
  if (
    !language ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > pageCount
  ) {
    return c.json({error: 'Language not found'}, 404);
  }

  const {data: languageMovies = [], status} = await readThroughCache(c, cache, {
    key: `languages:${language.code}:v1`,
    ttl: LANGUAGES_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () =>
      new LanguagesService(c.env).getLanguageMovies(language.code),
  });

  const pageMovies = languageMovies.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const body: LanguagePage = {
    code: language.code,
    movieCount: languageMovies.length,
    page,
    pageCount: Math.ceil(languageMovies.length / PAGE_SIZE),
    movies: pageMovies,
    awards: awardLegend(pageMovies),
  };
  const etag = createETag(body);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(body, LANGUAGES_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});
