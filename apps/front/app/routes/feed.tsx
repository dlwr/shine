import type {Route} from './+types/feed';
import {apiFetch} from '@/lib/api';
import {
  buildRssFeed,
  mergeFeedItems,
  type FeedItem,
  type FeedPeriod,
} from '@/lib/feed';

type HistoryItem = Omit<FeedItem, 'period'>;

async function fetchHistory(
  context: Route.LoaderArgs['context'],
  period: FeedPeriod,
  limit: number,
  signal: AbortSignal,
): Promise<FeedItem[] | undefined> {
  const response = await apiFetch(
    context,
    `/selections/${period}/history?locale=ja&limit=${limit}`,
    {signal},
  );

  if (!response.ok) {
    return undefined;
  }

  const {items} = (await response.json()) as {items: HistoryItem[]};
  return items.map(item => ({...item, period}));
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
