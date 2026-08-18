import {resolveApiUrl, type LoadContext} from './api';

export const MOVIES_PER_SITEMAP = 100;

const SITEMAP_CACHE_CONTROL = 'public, max-age=3600';

type SearchResponse = {
  movies?: Array<{uid: string}>;
  pagination?: {totalCount?: number};
};

export {resolveApiUrl} from './api';

async function fetchSearchPage(
  context: LoadContext,
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const response = await fetch(
    `${resolveApiUrl(context)}/movies/search?page=${page}&limit=${limit}`,
    {signal},
  );

  if (!response.ok) {
    throw new Error(`Sitemap source request failed: ${response.status}`);
  }

  return (await response.json()) as SearchResponse;
}

export async function fetchMovieTotalCount(
  context: LoadContext,
  signal?: AbortSignal,
): Promise<number> {
  try {
    const result = await fetchSearchPage(context, 1, 1, signal);
    return result.pagination?.totalCount ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchMovieUids(
  context: LoadContext,
  page: number,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    const result = await fetchSearchPage(
      context,
      page,
      MOVIES_PER_SITEMAP,
      signal,
    );
    return (result.movies ?? []).map(movie => movie.uid);
  } catch {
    return [];
  }
}

export function sitemapResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': SITEMAP_CACHE_CONTROL,
    },
  });
}
