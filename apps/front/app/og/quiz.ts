import {createImageResponse} from '@/lib/og/image-response';
import {tryApiJson, resolveQuizKey, type LoadContext} from '@/lib/api';
import {fetchPosterAsDataUri, loadGoogleFont} from '@/lib/og/assets';
import {OG_HEIGHT, OG_WIDTH, buildQuizCardHtml} from '@/lib/og/template';
import {upgradePosterForSharing} from '@/lib/meta';

const CACHE_CONTROL = 'public, max-age=3600';

type QuizAnswer = {
  posterUrl: string;
  focalX: number;
  focalY: number;
};

type PosterCrop = {posterDataUri?: string; focalX?: number; focalY?: number};

async function fetchTodaysPoster(
  context: LoadContext,
  signal: AbortSignal,
): Promise<PosterCrop> {
  const quizKey = resolveQuizKey(context);
  if (!quizKey) {
    return {};
  }

  const answer = await tryApiJson<QuizAnswer>(context, `/quiz/answer`, {
    headers: {'X-Quiz-Key': quizKey},
    signal,
  });
  if (!answer) {
    return {};
  }

  return {
    posterDataUri: await fetchPosterAsDataUri(
      upgradePosterForSharing(answer.posterUrl),
    ),
    focalX: answer.focalX,
    focalY: answer.focalY,
  };
}

// クエリの date はキャッシュ回避用で、描画は必ずAPIが返す当日分を使う
export async function renderQuizCard(
  request: Request,
  context: LoadContext,
): Promise<Response> {
  const daily = await tryApiJson<{date: string; poolSize: number}>(
    context,
    `/quiz/daily`,
    {signal: request.signal},
  );
  if (!daily) {
    return new Response('Quiz unavailable', {status: 503});
  }

  const {date, poolSize} = daily;

  const crop = await fetchTodaysPoster(context, request.signal);
  const html = buildQuizCardHtml({date, poolSize, ...crop});
  const notoSans = await loadGoogleFont('Noto Sans JP', 700, html);

  if (!notoSans) {
    return new Response('Font unavailable', {status: 503});
  }

  const image = await createImageResponse(html, {
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
