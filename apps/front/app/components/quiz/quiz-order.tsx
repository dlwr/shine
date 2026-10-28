import {useEffect, useState} from 'react';
import {PosterFrame} from '@/components/editorial/poster-frame';
import type {QuizOrderData} from '@/lib/api-types';
import {
  EMPTY_ORDER_STREAK,
  type OrderStreak,
  previousDay,
  recordOrderAnswer,
} from './order-streak';
import {readStorage, writeStorage} from './use-quiz-game';

const STORAGE_KEY = 'shine-quiz-order-v1';
const STREAK_KEY = 'shine-quiz-order-streak-v1';

type Result = {
  date: string;
  pickedUid: string;
  releaseDates: Record<string, string>;
};

function isPickedFirst(movieUids: string[], result: Result): boolean {
  return movieUids.every(
    uid => result.releaseDates[result.pickedUid] <= result.releaseDates[uid],
  );
}

function formatReleaseDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

export function QuizOrder({
  order,
  apiUrl,
}: {
  order: QuizOrderData;
  apiUrl: string;
}) {
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);
  const [streak, setStreak] = useState<OrderStreak>();
  const movieUids = order.movies.map(movie => movie.uid);

  useEffect(() => {
    const saved = readStorage<Result>(STORAGE_KEY);
    setResult(saved?.date === order.date ? saved : undefined);
    setStreak(readStorage<OrderStreak>(STREAK_KEY));
  }, [order.date]);

  async function pick(pickedUid: string) {
    if (pending || result) {
      return;
    }

    setPending(true);
    try {
      const response = await fetch(`${apiUrl}/quiz/order/answer`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({movieUids}),
      });
      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as {
        movies: Array<{uid: string; releaseDate: string}>;
      };
      const next = {
        date: order.date,
        pickedUid,
        releaseDates: Object.fromEntries(
          body.movies.map(movie => [movie.uid, movie.releaseDate]),
        ),
      };
      setResult(next);
      writeStorage(STORAGE_KEY, next);
      const nextStreak = recordOrderAnswer(
        readStorage<OrderStreak>(STREAK_KEY) ?? EMPTY_ORDER_STREAK,
        order.date,
        isPickedFirst(movieUids, next),
      );
      writeStorage(STREAK_KEY, nextStreak);
      setStreak(readStorage<OrderStreak>(STREAK_KEY));
    } finally {
      setPending(false);
    }
  }

  const isCorrect = result !== undefined && isPickedFirst(movieUids, result);

  return (
    <section className="mt-10 border-t border-ink pt-6">
      <h2 className="font-display font-bold text-xl mb-1">
        どっちが先に公開された？
      </h2>
      <p className="font-label text-xs text-ink-muted mb-4">
        {result
          ? isCorrect
            ? '正解！'
            : '残念！'
          : '先に公開されたと思う方を選ぶ'}
      </p>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        {order.movies.map(movie => {
          const content = (
            <>
              <PosterFrame
                posterUrl={movie.posterUrl}
                alt={movie.title}
                displaySize="w185"
              />
              <span className="mt-2 block font-display font-bold text-sm leading-snug">
                {movie.title}
              </span>
            </>
          );

          if (!result) {
            return (
              <button
                key={movie.uid}
                type="button"
                disabled={pending}
                onClick={async () => pick(movie.uid)}
                className="text-left text-ink">
                {content}
              </button>
            );
          }

          return (
            <div key={movie.uid}>
              <a href={`/movies/${movie.uid}`} className="block text-ink">
                {content}
              </a>
              <span className="font-label text-xs text-ink-muted">
                {formatReleaseDate(result.releaseDates[movie.uid])}
              </span>
              {movie.uid === result.pickedUid && (
                <span className="font-label text-[10px] text-ink-muted ml-2">
                  あなたの答え
                </span>
              )}
            </div>
          );
        })}
      </div>
      {result && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {streak && (
            <p className="font-display font-bold text-base">
              今 {streak.current} 問連続正解（最高 {streak.best}）
            </p>
          )}
          <a
            href={`/quiz?d=${previousDay(order.date)}`}
            className="font-label text-xs font-bold bg-brand text-brand-on px-3 py-1.5 border border-ink">
            もう1問（前の日の問題）
          </a>
        </div>
      )}
    </section>
  );
}
