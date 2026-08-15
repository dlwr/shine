import type {Environment} from '@shine/database';
import type {QuizGuessResult} from '@shine/types';
import {Hono} from 'hono';
import {
  buildQuizHints,
  QUIZ_MAX_ATTEMPTS,
  QuizService,
  toQuizAnswer,
  type QuizPoolEntry,
} from '../services/quiz-service';
import {createCachedResponse} from '../utils/cache';

export const quizRoutes = new Hono<{Bindings: Environment}>();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CANDIDATES_TTL = 86_400;
const DAILY_TTL = 600;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveDate(value: string | undefined): string | undefined {
  if (value === undefined) {
    return today();
  }

  return DATE_PATTERN.test(value) && value <= today() ? value : undefined;
}

quizRoutes.get('/daily', async c => {
  const date = resolveDate(c.req.query('date'));
  if (!date) {
    return c.json({error: 'Invalid date'}, 400);
  }

  const pool = await new QuizService(c.env).getPool();
  if (pool.length === 0) {
    return c.json({error: 'Quiz unavailable'}, 503);
  }

  return createCachedResponse(
    {date, maxAttempts: QUIZ_MAX_ATTEMPTS, poolSize: pool.length},
    DAILY_TTL,
  );
});

quizRoutes.get('/candidates', async c => {
  const candidates = await new QuizService(c.env).getCandidates();

  return createCachedResponse({candidates}, CANDIDATES_TTL);
});

quizRoutes.get('/answer', async c => {
  const key = c.env.QUIZ_ANSWER_KEY;
  if (!key || c.req.header('X-Quiz-Key') !== key) {
    return c.json({error: 'Unauthorized'}, 401);
  }

  const date = resolveDate(c.req.query('date'));
  if (!date) {
    return c.json({error: 'Invalid date'}, 400);
  }

  const entry = await new QuizService(c.env).getEntry(date);
  if (!entry) {
    return c.json({error: 'Quiz unavailable'}, 503);
  }

  return c.json(toQuizAnswer(entry, date), 200, {'Cache-Control': 'no-store'});
});

type GuessBody = {
  date?: string;
  movieUid?: string;
  attempt?: number;
};

function guessResult(
  entry: QuizPoolEntry,
  date: string,
  {movieUid, attempt}: {movieUid?: string; attempt: number},
): QuizGuessResult {
  const correct = movieUid === entry.uid;
  if (correct || attempt >= QUIZ_MAX_ATTEMPTS) {
    return {correct, answer: toQuizAnswer(entry, date)};
  }

  return {correct, hint: buildQuizHints(entry)[attempt - 1]};
}

quizRoutes.post('/guess', async c => {
  const body = await c.req.json<GuessBody>().catch(() => ({}) as GuessBody);
  const date = resolveDate(body.date);
  const attempt = Number(body.attempt);
  if (!date || !Number.isInteger(attempt) || attempt < 1) {
    return c.json({error: 'Invalid request'}, 400);
  }

  const entry = await new QuizService(c.env).getEntry(date);
  if (!entry) {
    return c.json({error: 'Quiz unavailable'}, 503);
  }

  return c.json(
    guessResult(entry, date, {movieUid: body.movieUid, attempt}),
    200,
    {'Cache-Control': 'no-store'},
  );
});
