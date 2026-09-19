import {BigYear} from '@/components/editorial/big-year';
import {MetaLine} from '@/components/editorial/meta-line';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {WatchedToggle} from '@/components/editorial/watched-toggle';
import type {MovieDetailData} from '@/lib/movie-detail';

export function MovieHero({
  movieDetail,
  title,
  isMonthlyPick,
}: {
  movieDetail: MovieDetailData;
  title: string;
  isMonthlyPick: boolean;
}) {
  const metaItems: string[] = [];
  if (movieDetail.imdbId) {
    metaItems.push(`IMDb ${movieDetail.imdbId}`);
  }

  if (movieDetail.originalLanguage) {
    metaItems.push(movieDetail.originalLanguage.toUpperCase());
  }

  return (
    <div className="flex gap-5 mb-8 pb-8 border-b-2 border-ink">
      <PosterFrame
        posterUrl={movieDetail.posterUrl}
        alt={`${title} poster`}
        className="w-28 md:w-36 shrink-0"
        priority
        displaySize="w342"
      />
      <div className="flex flex-col justify-end gap-2">
        {movieDetail.year && (
          <a
            href={`/years/${movieDetail.year}`}
            className="no-underline text-ink">
            <BigYear year={movieDetail.year} className="text-6xl md:text-7xl" />
          </a>
        )}
        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight">
          {title}
        </h1>
        <MetaLine items={metaItems} />
        <WatchedToggle uid={movieDetail.uid} isMonthlyPick={isMonthlyPick} />
      </div>
    </div>
  );
}
