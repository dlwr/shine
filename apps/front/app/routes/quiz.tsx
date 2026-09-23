import type {Route} from './+types/quiz';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {QuizClues} from '@/components/quiz/quiz-clues';
import {QuizGuessForm} from '@/components/quiz/quiz-guess-form';
import {QuizResult} from '@/components/quiz/quiz-result';
import {useQuizGame, type QuizPuzzle} from '@/components/quiz/use-quiz-game';
import {loadApiJson, resolveApiUrl, canTransformImages} from '@/lib/api';
import {transformedImageUrl} from '@/lib/image-transformations';
import {fetchMonthlyPick, type MonthlyPick} from '@/lib/monthly-pick';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {streakOf} from '@/lib/quiz-state';

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale, puzzle} = loaderData as {
    locale?: Locale;
    puzzle?: {date: string};
  };
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
  const transformImages = canTransformImages(context);

  const [puzzle, monthly] = await Promise.all([
    loadApiJson<QuizPuzzle>(context, '/quiz/daily', {
      label: 'quiz',
      signal: request.signal,
    }),
    fetchMonthlyPick(context, 'ja', request.signal),
  ]);

  return {puzzle, apiUrl, locale, monthly, transformImages};
}

export default function QuizPage({loaderData}: Route.ComponentProps) {
  const {puzzle, apiUrl, monthly, transformImages} = loaderData as {
    monthly?: MonthlyPick;
    puzzle: QuizPuzzle;
    apiUrl: string;
    transformImages?: boolean;
  };
  const locale = 'ja';

  const {
    game,
    history,
    isFinished,
    query,
    setQuery,
    pending,
    suggestions,
    submit,
  } = useQuizGame(puzzle, apiUrl);

  const stage = isFinished ? puzzle.maxAttempts : game.guesses.length;
  const remaining = puzzle.maxAttempts - game.guesses.length;
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
          {isFinished && (
            <QuizResult
              game={game}
              maxAttempts={puzzle.maxAttempts}
              monthly={monthly}
            />
          )}

          <div className="border-2 border-ink bg-surface md:col-start-1 md:row-start-1 md:row-span-2">
            <img
              src={transformedImageUrl(
                `/quiz/poster.png?date=${puzzle.date}&stage=${stage}`,
                transformImages ?? false,
              )}
              alt={isFinished ? game.answer?.title : 'ポスターの一部'}
              width={480}
              height={720}
              className="block w-full h-auto"
            />
          </div>

          <div
            className={
              isFinished
                ? 'md:col-start-2 md:row-start-2'
                : 'md:col-start-2 md:row-start-1'
            }>
            <QuizClues game={game} maxAttempts={puzzle.maxAttempts} />

            {!isFinished && (
              <QuizGuessForm
                query={query}
                remaining={remaining}
                suggestions={suggestions}
                pending={pending}
                onQueryChange={setQuery}
                onSubmit={submit}
              />
            )}
          </div>
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
