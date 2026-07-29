import type {Route} from './+types/sitemap-movies';
import {buildUrlSet} from '@/lib/sitemap';
import {fetchMovieUids, sitemapResponse} from '@/lib/sitemap-source';

export async function loader({context, request}: Route.LoaderArgs) {
  const page = Number(new URL(request.url).searchParams.get('page') ?? '1');

  if (!Number.isInteger(page) || page < 1) {
    return new Response('Not Found', {status: 404});
  }

  const uids = await fetchMovieUids(context, page, request.signal);

  return sitemapResponse(
    buildUrlSet(uids.map(uid => ({path: `/movies/${uid}`}))),
  );
}
