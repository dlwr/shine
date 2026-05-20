import {BigYear} from './big-year';
import {PosterFrame} from './poster-frame';

export type SearchRowMovie = {
  uid: string;
  title?: string;
  year?: number;
  posterUrl?: string;
  hasWinner?: boolean;
  translations?: Array<{
    languageCode: string;
    content: string;
    isDefault: number;
  }>;
};

export function SearchRow({
  movie,
  locale = 'en',
}: {
  movie: SearchRowMovie;
  locale?: string;
}) {
  const title =
    movie.title ??
    movie.translations?.find(t => t.languageCode === locale.split('-')[0])
      ?.content ??
    movie.translations?.[0]?.content ??
    'Unknown Title';

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex items-center gap-3 py-2 border-t-2 border-ink no-underline text-ink">
      <BigYear year={movie.year} className="text-2xl w-14 shrink-0" />
      <PosterFrame
        posterUrl={movie.posterUrl}
        alt={`${title} poster`}
        className="w-9 shrink-0"
      />
      <span className="flex-1 font-display font-extrabold text-sm leading-none">
        {title}
      </span>
      {movie.hasWinner ? (
        <span className="font-mono text-[9px] bg-brand text-brand-on px-1.5 py-0.5">
          ★
        </span>
      ) : undefined}
    </a>
  );
}
