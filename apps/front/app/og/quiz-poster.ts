import {createImageResponse} from '@/og/render/image-response';
import {apiFetch, resolveQuizKey, type LoadContext} from '@/lib/api';
import {fetchPosterAsDataUri} from '@/og/render/assets';
import {
  buildQuizPosterHtml,
  QUIZ_POSTER_HEIGHT,
  QUIZ_POSTER_WIDTH,
} from '@/og/render/quiz-poster';
import {upgradePosterForSharing} from '@/lib/meta';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_CONTROL = 'public, max-age=3600';
const ATTEMPTS = 2;

type QuizAnswer = {
  posterUrl: string;
  focalX: number;
  focalY: number;
};

export async function renderQuizPoster(
  request: Request,
  context: LoadContext,
): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? '';
  const stage = Number(url.searchParams.get('stage') ?? '0');

  if (!DATE_PATTERN.test(date) || !Number.isSafeInteger(stage) || stage < 0) {
    return new Response('Not Found', {status: 404});
  }

  const quizKey = resolveQuizKey(context);
  if (!quizKey) {
    return new Response('Quiz unavailable', {status: 503});
  }

  const answer = await fetchAnswer(context, date, quizKey, request.signal);
  if (answer === 'not-found') {
    return uncachedResponse('Not Found', 404);
  }

  if (!answer) {
    return uncachedResponse('Quiz answer unavailable', 503);
  }

  const posterDataUri = await fetchPoster(answer.posterUrl);
  if (!posterDataUri) {
    return uncachedResponse('Poster unavailable', 503);
  }

  const image = await createImageResponse(
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

async function fetchAnswer(
  context: LoadContext,
  date: string,
  quizKey: string,
  signal: AbortSignal,
): Promise<QuizAnswer | 'not-found' | undefined> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await apiFetch(context, `/quiz/answer?date=${date}`, {
        headers: {'X-Quiz-Key': quizKey},
        signal,
      });
      if (response.ok) {
        return (await response.json()) as QuizAnswer;
      }

      if (response.status < 500) {
        return 'not-found';
      }

      logFailure('answer', attempt, `HTTP ${response.status}`);
    } catch (error) {
      logFailure('answer', attempt, String(error));
    }
  }

  return undefined;
}

async function fetchPoster(posterUrl: string): Promise<string | undefined> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const dataUri = await fetchPosterAsDataUri(
      upgradePosterForSharing(posterUrl),
    );
    if (dataUri) {
      return dataUri;
    }

    logFailure('poster', attempt, posterUrl);
  }

  return undefined;
}

function logFailure(step: string, attempt: number, detail: string) {
  console.log(
    JSON.stringify({event: 'quiz_poster_failure', step, attempt, detail}),
  );
}

function uncachedResponse(body: string, status: number): Response {
  return new Response(body, {status, headers: {'Cache-Control': 'no-store'}});
}
