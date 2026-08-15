import {ImageResponse} from 'workers-og';
import type {Route} from './+types/quiz-poster';
import {resolveApiUrl, resolveQuizKey} from '@/lib/api';
import {fetchPosterAsDataUri} from '@/lib/og/assets';
import {
  buildQuizPosterHtml,
  QUIZ_POSTER_HEIGHT,
  QUIZ_POSTER_WIDTH,
} from '@/lib/og/quiz-poster';
import {upgradePosterForSharing} from '@/lib/meta';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_CONTROL = 'public, max-age=3600';

type QuizAnswer = {
  posterUrl: string;
  focalX: number;
  focalY: number;
};

export async function loader({context, request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? '';
  const stage = Number.parseInt(url.searchParams.get('stage') ?? '0', 10);

  if (!DATE_PATTERN.test(date) || !Number.isInteger(stage) || stage < 0) {
    return new Response('Not Found', {status: 404});
  }

  const quizKey = resolveQuizKey(context);
  if (!quizKey) {
    return new Response('Quiz unavailable', {status: 503});
  }

  const response = await fetch(
    `${resolveApiUrl(context)}/quiz/answer?date=${date}`,
    {headers: {'X-Quiz-Key': quizKey}, signal: request.signal},
  );
  if (!response.ok) {
    return new Response('Not Found', {status: 404});
  }

  const answer = (await response.json()) as QuizAnswer;
  const posterDataUri = await fetchPosterAsDataUri(
    upgradePosterForSharing(answer.posterUrl),
  );
  if (!posterDataUri) {
    return new Response('Poster unavailable', {status: 503});
  }

  const image = new ImageResponse(
    buildQuizPosterHtml({
      posterDataUri,
      stage,
      focalX: answer.focalX,
      focalY: answer.focalY,
    }),
    {width: QUIZ_POSTER_WIDTH, height: QUIZ_POSTER_HEIGHT},
  );

  // ストリームのままだとレンダリング失敗が空レスポンスに化けるため、先に全量を読む
  const body = await image.arrayBuffer();

  return new Response(body, {
    status: image.status,
    headers: {'Content-Type': 'image/png', 'Cache-Control': CACHE_CONTROL},
  });
}
