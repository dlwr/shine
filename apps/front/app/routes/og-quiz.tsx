import {ImageResponse} from 'workers-og';
import type {Route} from './+types/og-quiz';
import {resolveApiUrl, resolveQuizKey} from '@/lib/api';
import {fetchPosterAsDataUri, loadGoogleFont} from '@/lib/og/assets';
import {OG_HEIGHT, OG_WIDTH, buildQuizCardHtml} from '@/lib/og/template';
import {upgradePosterForSharing} from '@/lib/meta';

const CACHE_CONTROL = 'public, max-age=3600';

type QuizAnswer = {
  posterUrl: string;
  focalX: number;
  focalY: number;
};

async function fetchTodaysPoster(
  context: unknown,
  signal: AbortSignal,
): Promise<string | undefined> {
  const quizKey = resolveQuizKey(context);
  if (!quizKey) {
    return undefined;
  }

  const response = await fetch(`${resolveApiUrl(context)}/quiz/answer`, {
    headers: {'X-Quiz-Key': quizKey},
    signal,
  });
  if (!response.ok) {
    return undefined;
  }

  const answer = (await response.json()) as QuizAnswer;
  return fetchPosterAsDataUri(upgradePosterForSharing(answer.posterUrl));
}

// クエリの date はキャッシュ回避用で、描画は必ずAPIが返す当日分を使う
export async function loader({context, request}: Route.LoaderArgs) {
  const dailyResponse = await fetch(`${resolveApiUrl(context)}/quiz/daily`, {
    signal: request.signal,
  });
  if (!dailyResponse.ok) {
    return new Response('Quiz unavailable', {status: 503});
  }

  const {date, poolSize} = (await dailyResponse.json()) as {
    date: string;
    poolSize: number;
  };

  const posterDataUri = await fetchTodaysPoster(context, request.signal);
  const html = buildQuizCardHtml({date, poolSize, posterDataUri});
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
