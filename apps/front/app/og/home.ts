import {createImageResponse} from '@/og/render/image-response';
import {loadGoogleFont} from '@/og/render/assets';
import {
  OG_HEIGHT,
  OG_WIDTH,
  buildHomeCardHtml,
  OG_FONT_FAMILY,
} from '@/og/render/template';

const CACHE_CONTROL = 'public, max-age=604800';

export async function renderHomeCard(): Promise<Response> {
  const html = buildHomeCardHtml();
  const ogFont = await loadGoogleFont(OG_FONT_FAMILY, 700, html);

  if (!ogFont) {
    return new Response('Font unavailable', {status: 503});
  }

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
