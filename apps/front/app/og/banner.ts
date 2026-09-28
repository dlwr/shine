import {createImageResponse} from '@/lib/og/image-response';
import {loadGoogleFont} from '@/lib/og/assets';
import {
  BANNER_HEIGHT,
  BANNER_WIDTH,
  buildBannerHtml,
  OG_FONT_FAMILY,
} from '@/lib/og/template';

const CACHE_CONTROL = 'public, max-age=604800';

export async function renderBannerCard(): Promise<Response> {
  const html = buildBannerHtml();
  const ogFont = await loadGoogleFont(OG_FONT_FAMILY, 700, html);

  if (!ogFont) {
    return new Response('Font unavailable', {status: 503});
  }

  const image = await createImageResponse(html, {
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
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
