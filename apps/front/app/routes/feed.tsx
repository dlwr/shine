import type {Route} from './+types/feed';
import {tryApiJson} from '@/lib/api';
import type {SelectionHistoryItemData} from '@/lib/api-types';
import {
  buildRssFeed,
  mergeFeedItems,
  type FeedItem,
  type FeedPeriod,
} from '@/lib/feed';

async function fetchHistory(
  context: Route.LoaderArgs['context'],
  period: FeedPeriod,
  limit: number,
  signal: AbortSignal,
): Promise<FeedItem[] | undefined> {
  const body = await tryApiJson<{items: SelectionHistoryItemData[]}>(
    context,
    `/selections/${period}/history?locale=ja&limit=${limit}`,
    {signal},
  );
  return body?.items.map(item => ({...item, period}));
}

export async function loader({context, request}: Route.LoaderArgs) {
  const [daily, monthly] = await Promise.allSettled([
    fetchHistory(context, 'daily', 14, request.signal),
    fetchHistory(context, 'monthly', 3, request.signal),
  ]);

  if (daily.status === 'rejected' || !daily.value) {
    return new Response('Failed to load feed', {status: 502});
  }

  const monthlyItems =
    monthly.status === 'fulfilled' ? (monthly.value ?? []) : [];

  return new Response(buildRssFeed(mergeFeedItems(daily.value, monthlyItems)), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
