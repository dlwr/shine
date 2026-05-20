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
}: {
  movie: FilmCardMovie;
  variant: 'hero' | 'compact';
  locale?: string;
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
        className="block border-[3px] border-ink/40 bg-surface p-3 no-underline text-ink">
        <BigYear year={movie.year} className="text-4xl" />
        <div className="font-display font-black text-base tracking-tight mt-1">
          {title}
        </div>
      </a>
    );
  }

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex gap-4 border-[3px] border-ink bg-surface p-4 no-underline text-ink shadow-[var(--shadow-offset-sm)]">
      <PosterFrame
        posterUrl={posterUrl}
        alt={`${title} poster`}
        className="w-28 shrink-0"
      />
      <div className="flex flex-col justify-between">
        <BigYear year={movie.year} className="text-6xl" />
        <div>
          <div className="font-display font-black text-xl tracking-tight leading-none">
            {title}
          </div>
        </div>
      </div>
    </a>
  );
}
