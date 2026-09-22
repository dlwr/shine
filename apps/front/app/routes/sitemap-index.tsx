import type {Route} from './+types/sitemap-index';
import {buildSitemapIndex} from '@/lib/sitemap';
import {
  MOVIES_PER_SITEMAP,
  PEOPLE_PER_SITEMAP,
  fetchMovieUids,
  fetchPeopleTotalCount,
  sitemapResponse,
} from '@/lib/sitemap-source';

function pagedPaths(path: string, totalCount: number, perPage: number) {
  return Array.from(
    {length: Math.ceil(totalCount / perPage)},
    (_, index) => `${path}?page=${index + 1}`,
  );
}

export async function loader({context, request}: Route.LoaderArgs) {
  const [movieUids, peopleCount] = await Promise.all([
    fetchMovieUids(context, request.signal),
    fetchPeopleTotalCount(context, request.signal),
  ]);
  const paths = [
    '/sitemap/awards.xml',
    '/sitemap/years.xml',
    ...pagedPaths('/sitemap/movies.xml', movieUids.length, MOVIES_PER_SITEMAP),
    ...pagedPaths('/sitemap/people.xml', peopleCount, PEOPLE_PER_SITEMAP),
  ];

  return sitemapResponse(buildSitemapIndex(paths));
}
