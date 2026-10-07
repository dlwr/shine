import {createImageResponse} from '@/og/render/image-response';
import {fetchPosterAsDataUri, loadGoogleFont} from '@/og/render/assets';
import {pickRepresentativeTitles} from '@/og/render/person-card';
import {
  OG_HEIGHT,
  OG_WIDTH,
  buildPersonCardHtml,
  OG_FONT_FAMILY,
} from '@/og/render/template';
import {TAGLINE} from '@/lib/tagline';
import {profileImageUrl} from '@/lib/profile-image';
import {tryApiJson, type LoadContext} from '@/lib/api';

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
const BASE_TEXT = `SHINE出演・監督本0123456789${TAGLINE} `;

export async function renderPersonCard(
  request: Request,
  context: LoadContext,
): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return new Response('Not Found', {status: 404});
  }

  const person = await tryApiJson<PersonDetail>(
    context,
    `/people/${id}?locale=ja`,
    {signal: request.signal},
  );
  if (!person) {
    return new Response('Not Found', {status: 404});
  }

  const topTitles = pickRepresentativeTitles(person.credits, person.awards);

  const cardText =
    BASE_TEXT + person.name + person.originalName + topTitles.join('');

  const [portraitDataUri, ogFont] = await Promise.all([
    fetchPosterAsDataUri(profileImageUrl(person.profilePath, 'h632')),
    loadGoogleFont(OG_FONT_FAMILY, 700, cardText),
  ]);

  if (!ogFont) {
    return new Response('Font unavailable', {status: 503});
  }

  const html = buildPersonCardHtml({
    name: person.name,
    originalName: person.originalName,
    filmCount: person.credits.length,
    topTitles,
    portraitDataUri,
  });

  const image = await createImageResponse(html, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [{name: OG_FONT_FAMILY, data: ogFont, weight: 700, style: 'normal'}],
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
