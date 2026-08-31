import type {Route} from './+types/sitemap-years';
import {apiFetch, type LoadContext} from '@/lib/api';
import {buildUrlSet, type SitemapEntry} from '@/lib/sitemap';
import {sitemapResponse} from '@/lib/sitemap-source';

async function fetchYears(
  context: LoadContext,
  signal?: AbortSignal,
): Promise<number[]> {
  try {
    const response = await apiFetch(context, `/years`, {signal});
    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as {years?: Array<{year: number}>};
    return (body.years ?? []).map(entry => entry.year);
  } catch {
    return [];
  }
}

export async function loader({context, request}: Route.LoaderArgs) {
  const years = await fetchYears(context, request.signal);

  const entries: SitemapEntry[] = [
    {path: '/years', changefreq: 'weekly'},
    ...years.map(year => ({
      path: `/years/${year}`,
      changefreq: 'monthly' as const,
    })),
  ];

  return sitemapResponse(buildUrlSet(entries));
}
