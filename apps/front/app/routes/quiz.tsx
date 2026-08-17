import {useEffect, useMemo, useState} from 'react';
import type {Route} from './+types/quiz';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {resolveApiUrl} from '@/lib/api';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {
  applyGuess,
  createGame,
  filterCandidates,
  QUIZ_HISTORY_KEY,
  QUIZ_STATE_KEY,
  recordResult,
  shareText,
  streakOf,
  type QuizAnswer,
  type QuizCandidate,
  type QuizGameState,
  type QuizHint,
  type QuizHistory,
} from '@/lib/quiz-state';

const SUGGESTION_LIMIT = 8;

export function meta({data}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale, puzzle} = data as {locale?: Locale; puzzle?: {date: string}};
  const imageUrl = puzzle
    ? `${SITE_URL}/og/quiz.png?date=${puzzle.date}`
    : `${SITE_URL}/og/quiz.png`;
  // SNSのカードはページURL単位でキャッシュされるので、出題日で別URLにする
  const path = puzzle ? `/quiz?d=${puzzle.date}` : '/quiz';

  return buildSocialMeta({
    title: '今日の映画クイズ | SHINE',
    description:
      'ポスターの一部と5つのヒントから、今日の1本を当てる。カンヌ・アカデミー賞・キネマ旬報などに選ばれた映画から毎日1問。',
    path,
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl = resolveApiUrl(context);

  const [dailyResponse, candidatesResponse] = await Promise.all([
    fetch(`${apiUrl}/quiz/daily`, {signal: request.signal}),
    fetch(`${apiUrl}/quiz/candidates`, {signal: request.signal}),
  ]);

  if (!dailyResponse.ok || !candidatesResponse.ok) {
    throw new Response('Failed to load quiz', {status: 502});
  }

  const puzzle = (await dailyResponse.json()) as {
    date: string;
    maxAttempts: number;
    poolSize: number;
  };
  const {candidates} = (await candidatesResponse.json()) as {
    candidates: QuizCandidate[];
  };

  return {puzzle, candidates, apiUrl, locale};
}

function readStorage<T>(key: string): T | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // プライベートモードなどでは保存できないが、その日のプレイは続けられる
  }
}

export default function QuizPage({loaderData}: Route.ComponentProps) {
  const {puzzle, candidates, apiUrl} = loaderData as {
    puzzle: {date: string; maxAttempts: number; poolSize: number};
    candidates: QuizCandidate[];
    apiUrl: string;
  };
  const locale = 'ja';

  const [game, setGame] = useState<QuizGameState>(() =>
    createGame(puzzle.date),
  );
  const [history, setHistory] = useState<QuizHistory>({});
  const [restored, setRestored] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = readStorage<QuizGameState>(QUIZ_STATE_KEY);
    if (saved?.date === puzzle.date) {
      setGame(saved);
    }

    setHistory(readStorage<QuizHistory>(QUIZ_HISTORY_KEY) ?? {});
    setRestored(true);
  }, [puzzle.date]);

  useEffect(() => {
    if (restored) {
      writeStorage(QUIZ_STATE_KEY, game);
    }
  }, [game, restored]);

  const suggestions = useMemo(
    () => filterCandidates(candidates, query, SUGGESTION_LIMIT),
    [candidates, query],
  );

  const finished = game.status !== 'playing';
  const stage = finished ? puzzle.maxAttempts : game.guesses.length;
  const remaining = puzzle.maxAttempts - game.guesses.length;

  async function submit(candidate?: QuizCandidate) {
    if (pending || finished) {
      return;
    }

    setPending(true);
    try {
      const response = await fetch(`${apiUrl}/quiz/guess`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          date: puzzle.date,
          movieUid: candidate?.uid,
          attempt: game.guesses.length + 1,
        }),
      });
      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as {
        correct: boolean;
        hint?: QuizHint;
        answer?: QuizAnswer;
      };
      const next = applyGuess(
        game,
        {title: candidate?.title, correct: result.correct},
        result,
        puzzle.maxAttempts,
      );

      setGame(next);
      setQuery('');
      if (next.status !== 'playing') {
        const updated = recordResult(history, next);
        setHistory(updated);
        writeStorage(QUIZ_HISTORY_KEY, updated);
      }
    } finally {
      setPending(false);
    }
  }

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(shareText(game, puzzle.maxAttempts));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const streak = streakOf(history, puzzle.date);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight">
            TODAY&apos;S QUIZ
          </h1>
          <span className="font-mono text-xs text-ink-muted">
            {puzzle.date}
          </span>
        </div>
        <p className="font-mono text-xs text-ink-muted mb-6">
          ポスターの一部と5つのヒントから、今日の1本を当てる（全
          {puzzle.poolSize.toLocaleString('ja-JP')}本）
          {streak >= 2 ? ` — ${streak}日連続正解中` : ''}
        </p>

        <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr] md:items-start">
          <div className="border-2 border-ink bg-surface">
            <img
              src={`/quiz/poster.png?date=${puzzle.date}&stage=${stage}`}
              alt={finished ? game.answer?.title : 'ポスターの一部'}
              width={480}
              height={720}
              className="block w-full h-auto"
            />
          </div>

          <div>
            <div className="flex gap-1.5 mb-4" aria-label="残りの手数">
              {Array.from({length: puzzle.maxAttempts}, (_, index) => {
                const guess = game.guesses[index];
                const filled = guess
                  ? guess.correct
                    ? 'bg-brand'
                    : 'bg-ink'
                  : 'bg-transparent';
                return (
                  <span
                    key={index}
                    className={`w-4 h-4 border-2 border-ink ${filled}`}
                  />
                );
              })}
            </div>

            {game.hints.length > 0 && (
              <dl className="mb-5">
                {game.hints.map(hint => (
                  <div
                    key={hint.label}
                    className="flex gap-3 py-2 border-t-2 border-ink">
                    <dt className="font-mono text-[10px] text-ink-muted w-24 shrink-0 pt-0.5">
                      {hint.label}
                    </dt>
                    <dd className="font-display font-bold text-sm leading-snug">
                      {hint.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {finished ? (
              <div className="border-2 border-ink p-4">
                <p className="font-display font-black text-lg mb-1">
                  {game.status === 'won' ? '正解！' : '残念！'}
                </p>
                <p className="font-display font-bold text-base leading-snug">
                  {game.answer ? (
                    <a
                      href={`/movies/${game.answer.uid}`}
                      className="text-ink underline">
                      {game.answer.title}
                    </a>
                  ) : (
                    '—'
                  )}
                  {game.answer?.year ? (
                    <span className="font-mono text-xs text-ink-muted ml-2">
                      {game.answer.year}
                    </span>
                  ) : undefined}
                </p>
                <button
                  type="button"
                  onClick={copyShareText}
                  className="mt-4 font-mono text-xs font-bold bg-brand text-brand-on px-3 py-1.5 border-2 border-ink shadow-[3px_3px_0_var(--ink)]">
                  {copied ? 'コピーしました' : '結果をコピー'}
                </button>
                <p className="font-mono text-[10px] text-ink-muted mt-3">
                  次の問題は明日9時に出ます
                </p>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="quiz-guess"
                  className="block font-mono text-[10px] text-ink-muted mb-1">
                  邦題で回答（残り{remaining}回）
                </label>
                <input
                  id="quiz-guess"
                  type="text"
                  value={query}
                  autoComplete="off"
                  placeholder="タイトルを入力"
                  onChange={event => {
                    setQuery(event.target.value);
                  }}
                  className="w-full border-2 border-ink bg-surface px-3 py-2 font-display text-base"
                />

                {suggestions.length > 0 && (
                  <ul className="mt-2 border-2 border-ink divide-y-2 divide-ink">
                    {suggestions.map(candidate => (
                      <li key={candidate.uid}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={async () => submit(candidate)}
                          className="w-full text-left px-3 py-2 font-display font-bold text-sm bg-surface">
                          {candidate.title}
                          {candidate.year ? (
                            <span className="font-mono text-[10px] text-ink-muted ml-2">
                              {candidate.year}
                            </span>
                          ) : undefined}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  disabled={pending}
                  onClick={async () => submit()}
                  className="mt-3 font-mono text-xs font-bold px-3 py-1.5 border-2 border-ink text-ink">
                  パスしてヒントを見る
                </button>
              </div>
            )}
          </div>
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
