import {AwardYearFrame} from './award-year-frame';
import {PersonPortrait} from './person-portrait';
import type {PersonAwardYearGroupData} from '@/lib/api-types';

export type {PersonAwardYearGroupData} from '@/lib/api-types';
type PersonAwardNomineeData = PersonAwardYearGroupData['nominees'][number];
type PersonAwardMovieData = PersonAwardNomineeData['movies'][number];

function MovieLinks({movies}: {movies: PersonAwardMovieData[]}) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {movies.map(movie => (
        <a
          key={movie.uid}
          href={`/movies/${movie.uid}`}
          className="border-b border-ink-muted font-label text-[10px] text-ink no-underline">
          {movie.title ?? 'Unknown Title'}
        </a>
      ))}
    </span>
  );
}

function NomineeRow({nominee}: {nominee: PersonAwardNomineeData}) {
  if (nominee.isWinner) {
    return (
      <div className="flex items-center gap-4 py-3">
        <PersonPortrait
          name={nominee.name}
          profilePath={nominee.profilePath}
          className="w-12 shrink-0 md:w-16"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <a
            href={`/people/${nominee.uid}`}
            className="font-display text-base font-extrabold leading-tight text-ink no-underline md:text-lg">
            {nominee.name}
          </a>
          {nominee.originalName !== nominee.name && (
            <span className="font-label text-[10px] text-ink-muted">
              {nominee.originalName}
            </span>
          )}
          <MovieLinks movies={nominee.movies} />
        </span>
        <span className="shrink-0 border border-brand px-1.5 py-0.5 font-display text-xs leading-none text-brand">
          受賞
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <a
        href={`/people/${nominee.uid}`}
        className="shrink-0 font-label text-sm leading-tight text-ink no-underline">
        {nominee.name}
      </a>
      {nominee.originalName !== nominee.name && (
        <span className="font-label text-[10px] text-ink-muted">
          {nominee.originalName}
        </span>
      )}
      <MovieLinks movies={nominee.movies} />
    </div>
  );
}

export function PersonAwardYearSection({
  group,
}: {
  group: PersonAwardYearGroupData;
}) {
  return (
    <AwardYearFrame year={group.year} ceremonyNumber={group.ceremonyNumber}>
      {group.nominees.map(nominee => (
        <NomineeRow key={nominee.uid} nominee={nominee} />
      ))}
    </AwardYearFrame>
  );
}
