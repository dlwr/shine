import {ImageResponse} from 'workers-og';
import type {Route} from './+types/og-watched';
import {resolveApiUrl} from '@/lib/api';
import {awardHeading} from '@/lib/awards';
import {loadGoogleFont} from '@/lib/og/assets';
import {OG_HEIGHT, OG_WIDTH, buildWatchedCardHtml} from '@/lib/og/template';
import {
  decodeWatched,
  isWatchedEncoding,
  orderWinners,
  watchedStats,
} from '@/lib/watched';

const CACHE_CONTROL = 'public, max-age=3600';
const SLUG_PATTERN = /^[a-z0-9-]+$/;

type AwardResponse = {
  name: string;
  organization: string;
  grouping: 'year' | 'list' | 'person';
  subAward?: boolean;
  years: Array<{
    year: number;
    movies: Array<{uid: string; title?: string; isWinner: boolean}>;
  }>;
};

export async function loader({context, request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') ?? '';
  if (!SLUG_PATTERN.test(slug)) {
    return new Response('Not Found', {status: 404});
  }

  const response = await fetch(`${resolveApiUrl(context)}/awards/${slug}`, {
    signal: request.signal,
  });
  if (response.status === 404) {
    return new Response('Not Found', {status: 404});
  }

  if (!response.ok) {
    return new Response('Award unavailable', {status: 503});
  }

  const award = (await response.json()) as AwardResponse;
  if (award.grouping !== 'year' || award.subAward) {
    return new Response('Not Found', {status: 404});
  }

  const order = orderWinners(award).map(film => film.uid);
  const shared = url.searchParams.get('s');
  const watched = isWatchedEncoding(shared)
    ? decodeWatched(order, shared)
    : new Set<string>();

  const html = buildWatchedCardHtml({
    heading: awardHeading(award),
    ...watchedStats(order, watched),
    watchedFlags: order.map(uid => watched.has(uid)),
  });
  const notoSans = await loadGoogleFont('Noto Sans JP', 700, html);
  if (!notoSans) {
    return new Response('Font unavailable', {status: 503});
  }

  const image = new ImageResponse(html, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [
      {name: 'Noto Sans JP', data: notoSans, weight: 700, style: 'normal'},
    ],
  });

  // ストリームのままだとレンダリング失敗が空レスポンスに化けるため、先に全量を読む
  const body = await image.arrayBuffer();

  return new Response(body, {
    status: image.status,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': CACHE_CONTROL,
    },
  });
}
