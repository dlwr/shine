import {AvailabilityBadges} from './availability-badges';
import {BigYear} from './big-year';
import type {FilmCardMovie} from './film-card';
import {PosterFrame} from './poster-frame';
import {selectBestPoster} from '@/lib/poster';
import {resolveMovieTitle} from '@/lib/movie-title';

export type MonthlyPickMovie = FilmCardMovie & {
  tmdbId?: number | string;
  articleLinks?: Array<{
    uid: string;
    url?: string;
    title?: string;
    description?: string;
  }>;
};

const COPY = {
  ja: {
    label: 'MONTHLY / 今月の1本',
    tagline: '毎月1本、みんなで同じ映画を観る',
    posts: '観た人の記事・ポスト',
    empty: 'まだ投稿がありません。',
    cta: '感想や記事のリンクを貼る',
  },
  en: {
    label: 'MONTHLY',
    tagline: 'One film a month, watched together',
    posts: 'POSTS FROM VIEWERS',
    empty: 'No posts yet.',
    cta: 'Add your post or article',
  },
} as const;

export function MonthlyPick({
  movie,
  locale = 'ja',
}: {
  movie: MonthlyPickMovie;
  locale?: string;
}) {
  const copy = COPY[locale as keyof typeof COPY] ?? COPY.ja;
  const title = resolveMovieTitle(movie, {locale});
  const posterUrl =
    movie.posterUrls && movie.posterUrls.length > 0
      ? selectBestPoster(movie.posterUrls, locale)
      : movie.posterUrl;
  const movieHref = `/movies/${movie.uid}`;
  const winner = movie.nominations?.some(n => n.isWinner);
  const nomCount = movie.nominations?.length ?? 0;
  const chip = winner
    ? '★ WINNER'
    : nomCount > 0
      ? `${nomCount} NOMS`
      : undefined;
  const links = movie.articleLinks ?? [];

  return (
    <section className="border-[3px] border-ink bg-surface shadow-[var(--shadow-offset-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-ink px-3 py-1 text-paper">
        <span className="font-mono text-xs font-bold">{copy.label}</span>
        <span className="font-mono text-xs">{copy.tagline}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,240px)_1fr] gap-4 p-4">
        <a
          href={movieHref}
          aria-hidden="true"
          tabIndex={-1}
          className="block no-underline text-ink">
          <PosterFrame
            posterUrl={posterUrl}
            alt={`${title} poster`}
            className="w-full"
            priority
          />
        </a>
        <div className="min-w-0 flex flex-col gap-3">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <BigYear year={movie.year} className="text-5xl" />
              <a
                href={movieHref}
                className="block font-display text-2xl font-black leading-tight tracking-tight mt-1 no-underline text-ink">
                {title}
              </a>
            </div>
            {chip ? (
              <span className="shrink-0 bg-brand px-2 py-0.5 font-mono text-[10px] font-bold text-brand-on">
                {chip}
              </span>
            ) : undefined}
          </div>
          <AvailabilityBadges
            availability={movie.availability}
            movieTitle={title}
            tmdbId={movie.tmdbId}
          />
          <div className="border-t-2 border-ink pt-3">
            <p className="font-mono text-xs text-ink-muted mb-2">
              {copy.posts}
            </p>
            {links.length > 0 ? (
              <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
                {links.map(link => (
                  <li key={link.uid}>
                    {link.url ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-display font-bold text-sm text-ink underline break-words">
                        {link.title ?? link.url}
                      </a>
                    ) : (
                      <p className="text-sm text-ink break-words">
                        {link.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">{copy.empty}</p>
            )}
            <a
              href={`${movieHref}#article-links`}
              className="mt-3 inline-block font-mono text-xs font-bold border-2 border-ink px-3 py-1.5 shadow-[3px_3px_0_var(--ink)] no-underline text-ink">
              {copy.cta}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
