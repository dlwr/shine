import type {Route} from './+types/share';
import {DEFAULT_LOCALE} from '@/lib/locale';
import {fetchMonthlyPick} from '@/lib/monthly-pick';
import {sharedUrl} from '@/lib/share-target';

export async function loader({context, request}: Route.LoaderArgs) {
  const url = sharedUrl(new URL(request.url).searchParams);
  const monthly = await fetchMonthlyPick(
    context,
    DEFAULT_LOCALE,
    request.signal,
  );
  const query = url ? `?link=${encodeURIComponent(url)}` : '';

  return new Response(undefined, {
    status: 302,
    headers: {
      Location: monthly
        ? `/movies/${monthly.uid}${query}#article-links`
        : '/monthly',
      'Cache-Control': 'no-store',
    },
  });
}
