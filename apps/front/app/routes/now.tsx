import type {Route} from './+types/now';
import {DEFAULT_LOCALE} from '@/lib/locale';
import {fetchMonthlyPick, monthlyPickCacheSeconds} from '@/lib/monthly-pick';

function redirectTo(location: string, cacheControl: string): Response {
  return new Response(undefined, {
    status: 302,
    headers: {Location: location, 'Cache-Control': cacheControl},
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const monthly = await fetchMonthlyPick(
    context,
    DEFAULT_LOCALE,
    request.signal,
  );

  return monthly
    ? redirectTo(
        `/movies/${monthly.uid}`,
        `public, max-age=${monthlyPickCacheSeconds(new Date())}`,
      )
    : redirectTo('/monthly', 'no-store');
}
