import {ImageResponse} from 'workers-og';
import {loadGoogleFont} from '@/lib/og/assets';
import {OG_HEIGHT, OG_WIDTH, buildHomeCardHtml} from '@/lib/og/template';

const CACHE_CONTROL = 'public, max-age=604800';

export async function loader() {
  const html = buildHomeCardHtml();
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
