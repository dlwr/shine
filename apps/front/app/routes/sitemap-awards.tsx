import type {Route} from './+types/sitemap-awards';
import {buildUrlSet, type SitemapEntry} from '@/lib/sitemap';
import {resolveApiUrl, sitemapResponse} from '@/lib/sitemap-source';

type AwardListing = {
  slug: string;
  grouping: 'year' | 'list';
};

async function fetchAwards(
  context: unknown,
  signal?: AbortSignal,
): Promise<AwardListing[]> {
  try {
    const response = await fetch(`${resolveApiUrl(context)}/awards`, {signal});
    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as {awards?: AwardListing[]};
    return body.awards ?? [];
  } catch {
    return [];
  }
}

async function fetchAwardYears(
  context: unknown,
  slug: string,
  signal?: AbortSignal,
): Promise<number[]> {
  try {
    const response = await fetch(`${resolveApiUrl(context)}/awards/${slug}`, {
      signal,
    });
    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as {years?: Array<{year: number}>};
    return (body.years ?? []).map(group => group.year);
  } catch {
    return [];
  }
}

export async function loader({context, request}: Route.LoaderArgs) {
  const awards = await fetchAwards(context, request.signal);
  const yearAwards = awards.filter(award => award.grouping === 'year');
  const yearLists = await Promise.all(
    yearAwards.map(async award => ({
      slug: award.slug,
      years: await fetchAwardYears(context, award.slug, request.signal),
    })),
  );

  const entries: SitemapEntry[] = [
    {path: '/awards', changefreq: 'weekly'},
    {path: '/daily', changefreq: 'daily'},
    {path: '/weekly', changefreq: 'weekly'},
    {path: '/monthly', changefreq: 'monthly'},
    ...awards.map(award => ({
      path: `/awards/${award.slug}`,
      changefreq: 'weekly' as const,
    })),
    ...yearLists.flatMap(({slug, years}) =>
      years.map(year => ({
        path: `/awards/${slug}/${year}`,
        changefreq: 'monthly' as const,
      })),
    ),
  ];

  return sitemapResponse(buildUrlSet(entries));
}
