import {ImageResponse} from 'workers-og';
import type {Route} from './+types/og-person';
import {fetchPosterAsDataUri, loadGoogleFont} from '@/lib/og/assets';
import {pickRepresentativeTitles} from '@/lib/og/person-card';
import {OG_HEIGHT, OG_WIDTH, buildPersonCardHtml} from '@/lib/og/template';
import {profileImageUrl} from '@/lib/profile-image';
import {apiFetch} from '@/lib/api';

type PersonDetail = {
  name: string;
  originalName: string;
  profilePath?: string;
  credits: Array<{
    title?: string;
    awards: Array<{slug: string; isWinner: boolean}>;
    personAwards: Array<{isWinner: boolean}>;
  }>;
  awards: Array<{slug: string; grouping: 'year' | 'list'}>;
};

const CACHE_CONTROL = 'public, max-age=86400';
/** Satoriへ渡すフォントに最低限含める文字 */
const BASE_TEXT = 'なんか見るFILMS0123456789決められない日に、映画を1本 ';

export async function loader({context, request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return new Response('Not Found', {status: 404});
  }

  const response = await apiFetch(context, `/people/${id}?locale=ja`, {
    signal: request.signal,
  });
  if (!response.ok) {
    return new Response('Not Found', {status: 404});
  }

  const person = (await response.json()) as PersonDetail;
  const topTitles = pickRepresentativeTitles(person.credits, person.awards);

  const cardText =
    BASE_TEXT + person.name + person.originalName + topTitles.join('');

  const [portraitDataUri, notoSans] = await Promise.all([
    fetchPosterAsDataUri(profileImageUrl(person.profilePath, 'h632')),
    loadGoogleFont('Noto Sans JP', 700, cardText),
  ]);

  if (!notoSans) {
    return new Response('Font unavailable', {status: 503});
  }

  const html = buildPersonCardHtml({
    name: person.name,
    originalName: person.originalName,
    filmCount: person.credits.length,
    topTitles,
    portraitDataUri,
  });

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
