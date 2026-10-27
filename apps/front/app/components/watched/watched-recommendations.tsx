import {useEffect, useState} from 'react';
import {PosterFrame} from '@/components/editorial/poster-frame';
import type {WatchedRecommendationsData} from '@/lib/api-types';

const MAX_SOURCES = 20;
const MAX_SHOWN = 5;

type Recommendation = WatchedRecommendationsData['movies'][number];

export function WatchedRecommendations({
  apiUrl,
  watched,
}: {
  apiUrl: string;
  watched: ReadonlySet<string>;
}) {
  const [movies, setMovies] = useState<Recommendation[]>([]);

  useEffect(() => {
    if (watched.size === 0) {
      setMovies([]);
      return;
    }

    const controller = new AbortController();
    const uids = [...watched].slice(-MAX_SOURCES).join(',');
    void (async () => {
      try {
        const response = await fetch(
          `${apiUrl}/watched/recommendations?uids=${uids}`,
          {signal: controller.signal},
        );
        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as WatchedRecommendationsData;
        setMovies(
          body.movies
            .filter(movie => !watched.has(movie.uid))
            .slice(0, MAX_SHOWN),
        );
      } catch {
        setMovies([]);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [apiUrl, watched]);

  if (movies.length === 0) {
    return;
  }

  return (
    <section className="border-t-[3px] border-ink pt-4 mb-8">
      <h2 className="font-display font-extrabold text-xl md:text-2xl mb-4">
        観た映画から次の1本
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {movies.map(movie => (
          <li key={movie.uid} className="min-w-0">
            <a
              href={`/movies/${movie.uid}`}
              className="flex gap-3 no-underline text-ink">
              <PosterFrame
                posterUrl={movie.posterUrl}
                alt={`${movie.title} poster`}
                className="w-16 shrink-0"
                displaySize="w185"
              />
              <span className="min-w-0">
                <span className="block font-display font-bold text-base leading-tight break-words">
                  {movie.title}
                </span>
                {movie.year && (
                  <span className="block font-label text-xs text-ink-muted mt-1">
                    {movie.year}年
                  </span>
                )}
                <span className="block font-label text-xs mt-2 break-words">
                  {movie.reason}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
