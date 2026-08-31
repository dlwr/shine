import type {Route} from './+types/feed';
import {apiFetch} from '@/lib/api';
import {buildRssFeed, type FeedItem} from '@/lib/feed';

export async function loader({context, request}: Route.LoaderArgs) {
  const response = await apiFetch(
    context,
    `/selections/daily/history?locale=ja`,
    {signal: request.signal},
  );

  if (!response.ok) {
    return new Response('Failed to load feed', {status: 502});
  }

  const {items} = (await response.json()) as {items: FeedItem[]};

  return new Response(buildRssFeed(items), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
