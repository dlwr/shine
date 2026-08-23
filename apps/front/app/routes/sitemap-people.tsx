import type {Route} from './+types/sitemap-people';
import {buildUrlSet} from '@/lib/sitemap';
import {fetchPeopleUids, sitemapResponse} from '@/lib/sitemap-source';

export async function loader({context, request}: Route.LoaderArgs) {
  const page = Number(new URL(request.url).searchParams.get('page') ?? '1');

  if (!Number.isSafeInteger(page) || page < 1) {
    return new Response('Not Found', {status: 404});
  }

  const uids = await fetchPeopleUids(context, page, request.signal);

  return sitemapResponse(
    buildUrlSet(
      uids.map(uid => ({path: `/people/${uid}`, changefreq: 'monthly'})),
    ),
  );
}
