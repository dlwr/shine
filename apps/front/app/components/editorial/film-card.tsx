import {AvailabilityBadges, type AvailabilityInfo} from './availability-badges';
import {BigYear} from './big-year';
import {PosterFrame} from './poster-frame';
import {selectBestPoster, type PosterInfo} from '@/lib/poster';
import {resolveMovieTitle} from '@/lib/movie-title';

export type FilmCardMovie = {
  uid: string;
  title?: string;
  year?: number;
  posterUrl?: string;
  posterUrls?: PosterInfo[];
  translations?: Array<{
    languageCode: string;
    content: string;
    isDefault: number;
  }>;
  nominations?: Array<{
    uid: string;
    isWinner: boolean;
    category: {name: string};
  }>;
  availability?: AvailabilityInfo[];
};

function pickTitle(movie: FilmCardMovie, locale: string): string {
  return resolveMovieTitle(movie, {locale});
}

export function FilmCard({
  movie,
  variant,
  locale = 'en',
  label,
  index,
  priority = false,
  transformImages = false,
}: {
  movie: FilmCardMovie;
  variant: 'hero' | 'compact';
  locale?: string;
  label?: string;
  index?: string;
  priority?: boolean;
  transformImages?: boolean;
}) {
  const title = pickTitle(movie, locale);
  const posterUrl =
    movie.posterUrls && movie.posterUrls.length > 0
      ? selectBestPoster(movie.posterUrls, locale)
      : movie.posterUrl;

  if (variant === 'compact') {
    return (
      <a
        href={`/movies/${movie.uid}`}
        className="grid grid-cols-[3.5em_4rem_minmax(0,1fr)] items-start gap-3 border-b border-rule py-3 text-ink no-underline">
        <span className="pt-0.5 font-display text-sm font-bold">{label}</span>
        <PosterFrame
          posterUrl={posterUrl}
          alt={`${title} poster`}
          className="w-16"
          priority={priority}
          displaySize="w185"
          transformImages={transformImages}
        />
        <span className="min-w-0">
          <span className="block font-display text-lg leading-snug font-bold">
            {title}
          </span>
          {movie.year ? (
            <span className="mt-1 block font-display text-sm text-ink-muted tabular-nums">
              {movie.year}
            </span>
          ) : undefined}
        </span>
      </a>
    );
  }

  const winner = movie.nominations?.some(n => n.isWinner);
  const nomCount = movie.nominations?.length ?? 0;
  const chip = winner
    ? '★ WINNER'
    : nomCount > 0
      ? `${nomCount} NOMS`
      : undefined;

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="block border border-ink bg-surface no-underline text-ink">
      {label ? (
        <div className="flex items-center justify-between bg-ink px-3 py-1 text-paper">
          <span className="font-label text-xs font-bold">{label}</span>
          {index ? (
            <span className="font-label text-xs">{index}</span>
          ) : undefined}
        </div>
      ) : undefined}
      <div className="p-4">
        <PosterFrame
          posterUrl={posterUrl}
          alt={`${title} poster`}
          className="w-full"
          priority={priority}
          transformImages={transformImages}
        />
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <BigYear year={movie.year} className="text-5xl" />
            <div className="font-display text-lg font-bold leading-tight mt-1">
              {title}
            </div>
          </div>
          {chip ? (
            <span className="shrink-0 bg-brand px-2 py-0.5 font-label text-[10px] font-bold text-brand-on">
              {chip}
            </span>
          ) : undefined}
        </div>
        <AvailabilityBadges
          availability={movie.availability}
          className="mt-2"
        />
      </div>
    </a>
  );
}
