import {createImageResponse} from '@/lib/og/image-response';
import {tryApiJson, resolveQuizKey, type LoadContext} from '@/lib/api';
import {fetchPosterAsDataUri, loadGoogleFont} from '@/lib/og/assets';
import {
  OG_HEIGHT,
  OG_WIDTH,
  buildQuizCardHtml,
  OG_FONT_FAMILY,
} from '@/lib/og/template';
import {upgradePosterForSharing} from '@/lib/meta';

const CACHE_CONTROL = 'public, max-age=3600';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type QuizAnswer = {
  posterUrl: string;
  focalX: number;
  focalY: number;
};

type PosterCrop = {posterDataUri?: string; focalX?: number; focalY?: number};

type QuizDaily = {date: string; poolSize: number};

async function fetchPoster(
  context: LoadContext,
  date: string,
  signal: AbortSignal,
): Promise<PosterCrop> {
  const quizKey = resolveQuizKey(context);
  if (!quizKey) {
    return {};
  }

  const answer = await tryApiJson<QuizAnswer>(
    context,
    `/quiz/answer?date=${date}`,
    {
      headers: {'X-Quiz-Key': quizKey},
      signal,
    },
  );
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

// 未来の日付は API が断るので当日分で描き、答えの先読みを防ぐ
async function fetchDaily(
  context: LoadContext,
  date: string,
  signal: AbortSignal,
): Promise<QuizDaily | undefined> {
  const dated = DATE_PATTERN.test(date)
    ? await tryApiJson<QuizDaily>(context, `/quiz/daily?date=${date}`, {
        signal,
      })
    : undefined;

  return dated ?? tryApiJson<QuizDaily>(context, '/quiz/daily', {signal});
}

export async function renderQuizCard(
  request: Request,
  context: LoadContext,
): Promise<Response> {
  const daily = await fetchDaily(
    context,
    new URL(request.url).searchParams.get('date') ?? '',
    request.signal,
  );
  if (!daily) {
    return new Response('Quiz unavailable', {status: 503});
  }

  const {date, poolSize} = daily;

  const crop = await fetchPoster(context, date, request.signal);
  const html = buildQuizCardHtml({date, poolSize, ...crop});
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
