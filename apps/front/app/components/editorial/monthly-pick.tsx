import {AvailabilityBadges} from './availability-badges';
import type {FilmCardMovie} from './film-card';
import {PosterFrame} from './poster-frame';
import {WatchedToggle} from './watched-toggle';
import {selectBestPoster} from '@/lib/poster';
import {TAGLINE} from '@/lib/tagline';
import {resolveMovieTitle} from '@/lib/movie-title';

export type MonthlyPickMovie = FilmCardMovie & {
  tmdbId?: number | string;
  watchedCount?: number;
  articleLinks?: Array<{
    uid: string;
    url?: string;
    title?: string;
    description?: string;
  }>;
};

const COPY = {
  ja: {
    label: '今月の1本',
    stamp: '上映中',
    tagline: TAGLINE,
    year: (year: number) => `${year}年`,
    winner: '受賞作',
    nominations: (count: number) => `ノミネート ${count}`,
    watched: (count: number) => `観た人 ${count} 人`,
    posts: '観た人の記事・ポスト',
    empty: 'まだ投稿がありません。',
    cta: '感想や記事のリンクを貼る',
    archive: 'これまでの今月の1本',
  },
  en: {
    label: 'This month',
    stamp: 'Now showing',
    tagline: 'One film a month, watched together',
    year: String,
    winner: 'Winner',
    nominations: (count: number) =>
      `${count} nomination${count === 1 ? '' : 's'}`,
    watched: (count: number) => `${count} watched`,
    posts: 'Posts from viewers',
    empty: 'No posts yet.',
    cta: 'Add your post or article',
    archive: 'Past monthly picks',
  },
} as const;

const JAPANESE_SCRIPT = /[\u{3040}-\u{30FF}\u{3400}-\u{9FFF}]/u;

function shouldSetVertically(title: string, locale: string): boolean {
  return locale === 'ja' && JAPANESE_SCRIPT.test(title) && title.length <= 20;
}

export function MonthlyPick({
  movie,
  locale = 'ja',
  transformImages = false,
  apiUrl,
}: {
  movie: MonthlyPickMovie;
  locale?: string;
  transformImages?: boolean;
  apiUrl?: string;
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
  const standing = winner
    ? copy.winner
    : nomCount > 0
      ? copy.nominations(nomCount)
      : undefined;
  const meta = [movie.year ? copy.year(movie.year) : undefined, standing]
    .filter(Boolean)
    .join('　');
  const links = movie.articleLinks ?? [];
  const isVertical = shouldSetVertically(title, locale);

  return (
    <section className="border-b-[4px] border-double border-rule pb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl leading-tight font-bold">
            {copy.label}
          </h2>
          <p className="mt-1 font-display text-sm text-ink-muted">
            {copy.tagline}
          </p>
        </div>
        <span className="mt-1 shrink-0 -rotate-6 border-2 border-brand px-2 py-1 font-display text-sm leading-none font-bold text-brand">
          {copy.stamp}
        </span>
      </div>
      <div
        className={`@container mt-5 ${isVertical ? 'md:flex md:items-start md:gap-8' : 'grid grid-cols-1 gap-5 md:grid-cols-[280px_minmax(0,1fr)]'}`}>
        <div
          className={
            isVertical
              ? 'flex shrink-0 items-start gap-5'
              : 'flex flex-col gap-4'
          }>
          <a
            href={movieHref}
            aria-hidden="true"
            tabIndex={-1}
            className={`block text-ink no-underline ${isVertical ? 'w-[62cqw] shrink-0 md:w-[280px]' : ''}`}>
            <PosterFrame
              posterUrl={posterUrl}
              alt={`${title} poster`}
              className="w-full"
              priority
              transformImages={transformImages}
            />
          </a>
          <a
            href={movieHref}
            className={`font-display font-bold text-ink no-underline ${isVertical ? '[writing-mode:vertical-rl] max-h-[93cqw] text-3xl leading-[1.35] tracking-[0.08em] md:max-h-[420px] md:text-4xl' : 'text-3xl leading-tight'}`}>
            {title}
          </a>
        </div>
        <div
          className={`flex min-w-0 flex-col gap-4 ${isVertical ? 'mt-5 md:mt-0 md:flex-1' : ''}`}>
          {meta && (
            <p className="font-display text-base text-ink-muted">{meta}</p>
          )}
          {(movie.watchedCount ?? 0) > 0 && (
            <p className="font-label text-sm font-bold text-ink">
              {copy.watched(movie.watchedCount ?? 0)}
            </p>
          )}
          <AvailabilityBadges
            availability={movie.availability}
            movieTitle={title}
            tmdbId={movie.tmdbId}
          />
          <WatchedToggle
            isMonthlyPick
            uid={movie.uid}
            apiUrl={apiUrl}
            articleLinksHref={`${movieHref}#article-links`}
          />
          <div className="border-t border-rule pt-4">
            <h3 className="mb-2 font-display text-base font-bold">
              {copy.posts}
            </h3>
            {links.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {links.map(link => (
                  <li key={link.uid}>
                    {link.url ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm break-words text-ink underline">
                        {link.title ?? link.url}
                      </a>
                    ) : (
                      <p className="text-sm break-words text-ink">
                        {link.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">{copy.empty}</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              <a
                href={`${movieHref}#article-links`}
                className="border border-ink bg-ink px-4 py-2 font-label text-sm font-bold text-paper no-underline">
                {copy.cta}
              </a>
              <a
                href="/monthly"
                className="font-label text-sm text-ink-muted underline">
                {copy.archive}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
