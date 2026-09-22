import type {Route} from './+types/sitemap-movies';
import {buildUrlSet} from '@/lib/sitemap';
import {
  fetchMovieUids,
  sitemapResponse,
  sliceMovieUidsForPage,
} from '@/lib/sitemap-source';

export async function loader({context, request}: Route.LoaderArgs) {
  const page = Number(new URL(request.url).searchParams.get('page') ?? '1');

  if (!Number.isSafeInteger(page) || page < 1) {
    return new Response('Not Found', {status: 404});
  }

  const uids = sliceMovieUidsForPage(
    await fetchMovieUids(context, request.signal),
    page,
  );

  return sitemapResponse(
    buildUrlSet(uids.map(uid => ({path: `/movies/${uid}`}))),
  );
}
