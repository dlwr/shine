import {AvailabilityBadges} from '@/components/editorial/availability-badges';
import {PosterFrame} from '@/components/editorial/poster-frame';
import type {AwardMovieEntryData} from '@/lib/award-page';

function RankLabel({rank}: {rank: string}) {
  return (
    <span className="font-mono text-[10px] text-ink-muted w-7 shrink-0 tabular-nums">
      {rank}
    </span>
  );
}

export function AwardMovieRow({movie}: {movie: AwardMovieEntryData}) {
  const title = movie.title ?? 'Unknown Title';

  if (movie.isWinner) {
    return (
      <a
        href={`/movies/${movie.uid}`}
        className="flex items-center gap-4 py-3 no-underline text-ink">
        {movie.specialMention && <RankLabel rank={movie.specialMention} />}
        <PosterFrame
          posterUrl={movie.posterUrl}
          alt={`${title} poster`}
          className="w-16 shrink-0"
          displaySize="w185"
        />
        <div className="flex-1 min-w-0">
          <span className="block font-display font-extrabold text-base md:text-lg leading-tight">
            {title}
          </span>
          <AvailabilityBadges
            availability={movie.availability}
            className="mt-1.5"
            showCheckedDate={false}
          />
        </div>
        {!movie.specialMention && (
          <span className="font-mono text-[9px] bg-brand text-brand-on px-1.5 py-0.5 shrink-0">
            WINNER
          </span>
        )}
      </a>
    );
  }

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex items-center gap-4 py-1.5 no-underline text-ink">
      {movie.specialMention && <RankLabel rank={movie.specialMention} />}
      <div className="flex-1 min-w-0">
        <span className="block font-mono text-sm leading-tight">{title}</span>
        <AvailabilityBadges
          availability={movie.availability}
          className="mt-1"
          showCheckedDate={false}
        />
      </div>
    </a>
  );
}
