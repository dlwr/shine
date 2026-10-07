import {createImageResponse} from '@/og/render/image-response';
import {
  buildBadges,
  type AvailabilityInfo,
} from '@/components/editorial/availability-badges';
import {fetchPosterAsDataUri, loadGoogleFont} from '@/og/render/assets';
import {
  OG_HEIGHT,
  OG_WIDTH,
  buildMovieCardHtml,
  OG_FONT_FAMILY,
} from '@/og/render/template';
import {TAGLINE} from '@/lib/tagline';
import {upgradePosterForSharing} from '@/lib/meta';
import {tryApiJson, type LoadContext} from '@/lib/api';

type MovieDetail = {
  title?: string;
  originalLanguage?: string;
  year?: number;
  posterUrl?: string;
  nominations?: Array<{
    organization: {name: string; shortName?: string};
  }>;
  availability?: AvailabilityInfo[];
  translations?: Array<{languageCode: string; content: string}>;
};

const CACHE_CONTROL = 'public, max-age=86400';
/** Satoriへ渡すフォントに最低限含める文字 */
const BASE_TEXT = `SHINE0123456789${TAGLINE}見放題宅配レンタル配信あり `;

export async function renderMovieCard(
  request: Request,
  context: LoadContext,
): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return new Response('Not Found', {status: 404});
  }

  const movie = await tryApiJson<MovieDetail>(context, `/movies/${id}`, {
    signal: request.signal,
  });
  if (!movie) {
    return new Response('Not Found', {status: 404});
  }

  const title = movie.title ?? 'タイトル不明';
  const originalTitle = movie.translations?.find(
    translation => translation.languageCode === movie.originalLanguage,
  )?.content;

  const organizations = [
    ...new Set(
      (movie.nominations ?? []).map(
        nomination =>
          nomination.organization.shortName || nomination.organization.name,
      ),
    ),
  ];
  const availabilityLabels = buildBadges(movie.availability ?? []).map(
    badge => badge.label,
  );

  const cardText =
    BASE_TEXT +
    title +
    (originalTitle ?? '') +
    organizations.join('') +
    availabilityLabels.join('');

  const [posterDataUri, ogFont] = await Promise.all([
    fetchPosterAsDataUri(upgradePosterForSharing(movie.posterUrl)),
    loadGoogleFont(OG_FONT_FAMILY, 700, cardText),
  ]);

  if (!ogFont) {
    return new Response('Font unavailable', {status: 503});
  }

  const html = buildMovieCardHtml({
    title,
    originalTitle,
    year: movie.year,
    posterDataUri,
    organizations,
    availabilityLabels,
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
