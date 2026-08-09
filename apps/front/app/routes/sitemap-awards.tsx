import type {Route} from './+types/sitemap-awards';
import {buildUrlSet, type SitemapEntry} from '@/lib/sitemap';
import {resolveApiUrl, sitemapResponse} from '@/lib/sitemap-source';

async function fetchAwardSlugs(
  context: unknown,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    const response = await fetch(`${resolveApiUrl(context)}/awards`, {signal});
    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as {awards?: Array<{slug: string}>};
    return (body.awards ?? []).map(award => award.slug);
  } catch {
    return [];
  }
}

export async function loader({context, request}: Route.LoaderArgs) {
  const slugs = await fetchAwardSlugs(context, request.signal);
  const entries: SitemapEntry[] = [
    {path: '/awards', changefreq: 'weekly'},
    {path: '/daily', changefreq: 'daily'},
    {path: '/weekly', changefreq: 'weekly'},
    {path: '/monthly', changefreq: 'monthly'},
    ...slugs.map(slug => ({
      path: `/awards/${slug}`,
      changefreq: 'weekly' as const,
    })),
  ];

  return sitemapResponse(buildUrlSet(entries));
}
