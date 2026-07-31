import type {Route} from './+types/sitemap-index';
import {buildSitemapIndex} from '@/lib/sitemap';
import {
  MOVIES_PER_SITEMAP,
  fetchMovieTotalCount,
  sitemapResponse,
} from '@/lib/sitemap-source';

export async function loader({context, request}: Route.LoaderArgs) {
  const totalCount = await fetchMovieTotalCount(context, request.signal);
  const pageCount = Math.ceil(totalCount / MOVIES_PER_SITEMAP);
  const paths = [
    '/sitemap/awards.xml',
    ...Array.from(
      {length: pageCount},
      (_, index) => `/sitemap/movies.xml?page=${index + 1}`,
    ),
  ];

  return sitemapResponse(buildSitemapIndex(paths));
}
