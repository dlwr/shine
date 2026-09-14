import type {LoadContext} from '@/lib/api';
import {renderBannerCard} from './banner';
import {renderHomeCard} from './home';
import {renderMovieCard} from './movie';
import {isOgPath, type OgPath} from './paths';
import {renderPersonCard} from './person';
import {renderQuizCard} from './quiz';
import {renderQuizPoster} from './quiz-poster';
import {renderWatchedCard} from './watched';

type OgHandler = (request: Request, context: LoadContext) => Promise<Response>;

export const ogHandlers: Record<OgPath, OgHandler> = {
  '/og/movie.png': renderMovieCard,
  '/og/person.png': renderPersonCard,
  '/og/home.png': renderHomeCard,
  '/og/banner.png': renderBannerCard,
  '/og/quiz.png': renderQuizCard,
  '/og/watched.png': renderWatchedCard,
  '/quiz/poster.png': renderQuizPoster,
};

export async function handleOgRequest(
  request: Request,
  context: LoadContext,
): Promise<Response> {
  const {pathname} = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {status: 405});
  }

  return isOgPath(pathname)
    ? ogHandlers[pathname](request, context)
    : new Response('Not Found', {status: 404});
}
