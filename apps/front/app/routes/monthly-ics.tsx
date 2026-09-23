import type {Route} from './+types/monthly-ics';
import {loadApiJson} from '@/lib/api';
import type {SelectionHistoryItemData} from '@/lib/api-types';
import {buildMonthlyCalendar} from '@/lib/monthly-calendar';
import {loadNextSelection} from '@/lib/selection-archive';

export async function loader({context, request}: Route.LoaderArgs) {
  const [{items}, next] = await Promise.all([
    loadApiJson<{items: SelectionHistoryItemData[]}>(
      context,
      '/selections/monthly/history?locale=ja&limit=12',
      {label: 'calendar', signal: request.signal},
    ),
    loadNextSelection('monthly', 'ja', context, request),
  ]);

  return new Response(buildMonthlyCalendar(next ? [next, ...items] : items), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
