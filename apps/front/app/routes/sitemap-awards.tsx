import type {Route} from './+types/sitemap-awards';
import {buildUrlSet, type SitemapEntry} from '@/lib/sitemap';
import {resolveApiUrl, sitemapResponse} from '@/lib/sitemap-source';

type AwardListing = {
  slug: string;
  grouping: 'year' | 'list';
};

type AwardDetailShape = {
  years?: Array<{year: number}>;
  pagination?: {totalPages: number};
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

async function fetchAwardDetail(
  context: unknown,
  slug: string,
  signal?: AbortSignal,
): Promise<AwardDetailShape> {
  try {
    const response = await fetch(`${resolveApiUrl(context)}/awards/${slug}`, {
      signal,
    });
    if (!response.ok) {
      return {};
    }

    return (await response.json()) as AwardDetailShape;
  } catch {
    return {};
  }
}

function subPageEntries(
  award: AwardListing,
  detail: AwardDetailShape,
): SitemapEntry[] {
  if (award.grouping === 'year') {
    return (detail.years ?? []).map(group => ({
      path: `/awards/${award.slug}/${group.year}`,
      changefreq: 'monthly',
    }));
  }

  const totalPages = detail.pagination?.totalPages ?? 1;
  return Array.from({length: Math.max(0, totalPages - 1)}, (_, index) => ({
    path: `/awards/${award.slug}?page=${index + 2}`,
    changefreq: 'weekly',
  }));
}

export async function loader({context, request}: Route.LoaderArgs) {
  const awards = await fetchAwards(context, request.signal);
  const details = await Promise.all(
    awards.map(async award => ({
      award,
      detail: await fetchAwardDetail(context, award.slug, request.signal),
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
    ...details.flatMap(({award, detail}) => subPageEntries(award, detail)),
  ];

  return sitemapResponse(buildUrlSet(entries));
}
