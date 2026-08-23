import {resolveApiUrl, type LoadContext} from './api';

export const MOVIES_PER_SITEMAP = 100;
export const PEOPLE_PER_SITEMAP = 500;

const SITEMAP_CACHE_CONTROL = 'public, max-age=3600';

type PagedResponse<Key extends string> = {
  [key in Key]?: Array<{uid: string}>;
} & {
  pagination?: {totalCount?: number};
};

export {resolveApiUrl} from './api';

async function fetchSource<Key extends string>(
  context: LoadContext,
  path: string,
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<PagedResponse<Key>> {
  const response = await fetch(
    `${resolveApiUrl(context)}${path}?page=${page}&limit=${limit}`,
    {signal},
  );

  if (!response.ok) {
    throw new Error(`Sitemap source request failed: ${response.status}`);
  }

  return (await response.json()) as PagedResponse<Key>;
}

async function fetchTotalCount(
  context: LoadContext,
  path: string,
  signal?: AbortSignal,
): Promise<number> {
  try {
    const result = await fetchSource(context, path, 1, 1, signal);
    return result.pagination?.totalCount ?? 0;
  } catch {
    return 0;
  }
}

async function fetchUids<Key extends string>(
  context: LoadContext,
  path: string,
  key: Key,
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    const result = await fetchSource<Key>(context, path, page, limit, signal);
    return (result[key] ?? []).map(entry => entry.uid);
  } catch {
    return [];
  }
}

export async function fetchMovieTotalCount(
  context: LoadContext,
  signal?: AbortSignal,
): Promise<number> {
  return fetchTotalCount(context, '/movies/search', signal);
}

export async function fetchMovieUids(
  context: LoadContext,
  page: number,
  signal?: AbortSignal,
): Promise<string[]> {
  return fetchUids(
    context,
    '/movies/search',
    'movies',
    page,
    MOVIES_PER_SITEMAP,
    signal,
  );
}

export async function fetchPeopleTotalCount(
  context: LoadContext,
  signal?: AbortSignal,
): Promise<number> {
  return fetchTotalCount(context, '/people', signal);
}

export async function fetchPeopleUids(
  context: LoadContext,
  page: number,
  signal?: AbortSignal,
): Promise<string[]> {
  return fetchUids(
    context,
    '/people',
    'people',
    page,
    PEOPLE_PER_SITEMAP,
    signal,
  );
}

export function sitemapResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': SITEMAP_CACHE_CONTROL,
    },
  });
}
