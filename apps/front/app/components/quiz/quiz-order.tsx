import {useEffect, useState} from 'react';
import {PosterFrame} from '@/components/editorial/poster-frame';
import type {QuizOrderData} from '@/lib/api-types';
import {readStorage, writeStorage} from './use-quiz-game';

const STORAGE_KEY = 'shine-quiz-order-v1';

type Result = {
  date: string;
  pickedUid: string;
  releaseDates: Record<string, string>;
};

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

  useEffect(() => {
    const saved = readStorage<Result>(STORAGE_KEY);
    setResult(saved?.date === order.date ? saved : undefined);
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
        body: JSON.stringify({movieUids: order.movies.map(movie => movie.uid)}),
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
    } finally {
      setPending(false);
    }
  }

  const isCorrect =
    result !== undefined &&
    order.movies.every(
      movie =>
        result.releaseDates[result.pickedUid] <= result.releaseDates[movie.uid],
    );

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
    </section>
  );
}
