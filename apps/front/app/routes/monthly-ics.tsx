import type {Route} from './+types/monthly-ics';
import {apiFetch} from '@/lib/api';
import type {SelectionHistoryItemData} from '@/lib/api-types';
import {buildMonthlyCalendar} from '@/lib/monthly-calendar';
import {loadNextSelection} from '@/lib/selection-archive';

export async function loader({context, request}: Route.LoaderArgs) {
  const [response, next] = await Promise.all([
    apiFetch(context, '/selections/monthly/history?locale=ja&limit=12', {
      signal: request.signal,
    }),
    loadNextSelection('monthly', 'ja', context, request),
  ]);

  if (!response.ok) {
    return new Response('Failed to load calendar', {status: 502});
  }

  const {items} = (await response.json()) as {
    items: SelectionHistoryItemData[];
  };

  return new Response(buildMonthlyCalendar(next ? [next, ...items] : items), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
