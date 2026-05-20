import {BigYear} from './big-year';
import {PosterFrame} from './poster-frame';
import {selectBestPoster, type PosterInfo} from '@/lib/poster';

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
};

function pickTitle(movie: FilmCardMovie, locale: string): string {
  if (movie.title) {
    return movie.title;
  }

  const translations = movie.translations ?? [];
  const code = locale.split('-')[0];
  return (
    translations.find(t => t.languageCode === code)?.content ??
    translations.find(t => t.isDefault === 1)?.content ??
    translations[0]?.content ??
    'Unknown Title'
  );
}

export function FilmCard({
  movie,
  variant,
  locale = 'en',
  label,
  index,
}: {
  movie: FilmCardMovie;
  variant: 'hero' | 'compact';
  locale?: string;
  label?: string;
  index?: string;
}) {
  const title = pickTitle(movie, locale);
  const posterUrl =
    movie.posterUrls && movie.posterUrls.length > 0
      ? selectBestPoster(movie.posterUrls, locale)
      : movie.posterUrl;

  const winner = movie.nominations?.some(n => n.isWinner);
  const nomCount = movie.nominations?.length ?? 0;
  const chip = winner
    ? '★ WINNER'
    : nomCount > 0
      ? `${nomCount} NOMS`
      : undefined;

  if (variant === 'compact') {
    return (
      <a
        href={`/movies/${movie.uid}`}
        className="flex border-[3px] border-ink/40 bg-surface no-underline text-ink">
        {label ? (
          <div className="flex items-center justify-center bg-ink px-1 text-paper font-mono text-[10px] font-bold [writing-mode:vertical-rl] rotate-180">
            {label}
          </div>
        ) : undefined}
        <div className="p-3">
          <BigYear year={movie.year} className="text-4xl" />
          <div className="font-display text-base font-black tracking-tight mt-1">
            {title}
          </div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="block border-[3px] border-ink bg-surface no-underline text-ink shadow-[var(--shadow-offset-sm)]">
      {label ? (
        <div className="flex items-center justify-between bg-ink px-3 py-1 text-paper">
          <span className="font-mono text-xs font-bold">{label}</span>
          {index ? (
            <span className="font-mono text-xs">{index}</span>
          ) : undefined}
        </div>
      ) : undefined}
      <div className="flex gap-4 p-4">
        <PosterFrame
          posterUrl={posterUrl}
          alt={`${title} poster`}
          className="w-28 shrink-0"
        />
        <div className="flex flex-col justify-between gap-3">
          <BigYear year={movie.year} className="text-5xl md:text-6xl" />
          <div>
            <div className="font-display text-xl font-black leading-none tracking-tight">
              {title}
            </div>
            {chip ? (
              <span className="mt-2 inline-block bg-brand px-2 py-0.5 font-mono text-[10px] font-bold text-brand-on">
                {chip}
              </span>
            ) : undefined}
          </div>
        </div>
      </div>
    </a>
  );
}
