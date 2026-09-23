import type {Route} from './+types/sitemap-awards';
import {tryApiJson, type LoadContext} from '@/lib/api';
import type {
  AwardPageData,
  AwardsListData,
  AwardSummaryData,
} from '@/lib/api-types';
import {buildUrlSet, type SitemapEntry} from '@/lib/sitemap';
import {sitemapResponse} from '@/lib/sitemap-source';

async function fetchAwards(
  context: LoadContext,
  signal?: AbortSignal,
): Promise<AwardSummaryData[]> {
  try {
    const body = await tryApiJson<AwardsListData>(context, `/awards`, {
      signal,
    });
    if (!body) {
      return [];
    }

    return body.awards ?? [];
  } catch {
    return [];
  }
}

async function fetchAwardDetail(
  context: LoadContext,
  slug: string,
  signal?: AbortSignal,
): Promise<AwardPageData | undefined> {
  try {
    return await tryApiJson<AwardPageData>(context, `/awards/${slug}`, {
      signal,
    });
  } catch {
    return undefined;
  }
}

function subPageEntries(
  award: AwardSummaryData,
  detail: AwardPageData | undefined,
): SitemapEntry[] {
  if (award.grouping === 'person') {
    return [];
  }

  if (award.grouping === 'year') {
    return (detail?.years ?? []).map(group => ({
      path: `/awards/${award.slug}/${group.year}`,
      changefreq: 'monthly',
    }));
  }

  const totalPages =
    detail && 'pagination' in detail ? (detail.pagination?.totalPages ?? 1) : 1;
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
    {path: '/crossings', changefreq: 'weekly'},
    {path: '/uncrowned', changefreq: 'weekly'},
    {path: '/people', changefreq: 'weekly'},
    {path: '/people/crossings', changefreq: 'weekly'},
    {path: '/quiz', changefreq: 'daily'},
    {path: '/watched', changefreq: 'weekly'},
    {path: '/daily', changefreq: 'daily'},
    {path: '/weekly', changefreq: 'weekly'},
    {path: '/monthly', changefreq: 'monthly'},
    ...awards.map(award => ({
      path: `/awards/${award.slug}`,
      changefreq: 'weekly' as const,
    })),
    ...details.flatMap(({award, detail}) => subPageEntries(award, detail)),
    ...awards
      .filter(award => award.grouping === 'year' && !award.subAward)
      .map(award => ({
        path: `/watched/${award.slug}`,
        changefreq: 'weekly' as const,
      })),
  ];

  return sitemapResponse(buildUrlSet(entries));
}
