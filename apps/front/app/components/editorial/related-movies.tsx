import {PosterFrame} from '@/components/editorial/poster-frame';
import type {RelatedMovie} from '@/lib/movie-detail';

export function RelatedMovies({movies}: {movies: RelatedMovie[]}) {
  if (movies.length === 0) {
    return;
  }

  return (
    <section className="mb-8">
      <p className="font-mono text-xs text-ink-muted mb-3">関連映画</p>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {movies.map(relatedMovie => (
          <a
            key={relatedMovie.uid}
            href={`/movies/${relatedMovie.uid}`}
            className="no-underline text-ink">
            <PosterFrame
              posterUrl={relatedMovie.posterUrl}
              alt={`${relatedMovie.title} poster`}
              className="w-full"
              displaySize="w342"
            />
            <span className="block font-display font-bold text-xs leading-tight mt-1.5">
              {relatedMovie.title}
            </span>
            {relatedMovie.year && (
              <span className="block font-mono text-[10px] text-ink-muted mt-0.5">
                {relatedMovie.year}
              </span>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
