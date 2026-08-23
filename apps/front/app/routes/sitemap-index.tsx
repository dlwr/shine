import type {Route} from './+types/sitemap-index';
import {buildSitemapIndex} from '@/lib/sitemap';
import {
  MOVIES_PER_SITEMAP,
  PEOPLE_PER_SITEMAP,
  fetchMovieTotalCount,
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
  const [movieCount, peopleCount] = await Promise.all([
    fetchMovieTotalCount(context, request.signal),
    fetchPeopleTotalCount(context, request.signal),
  ]);
  const paths = [
    '/sitemap/awards.xml',
    '/sitemap/years.xml',
    ...pagedPaths('/sitemap/movies.xml', movieCount, MOVIES_PER_SITEMAP),
    ...pagedPaths('/sitemap/people.xml', peopleCount, PEOPLE_PER_SITEMAP),
  ];

  return sitemapResponse(buildSitemapIndex(paths));
}
