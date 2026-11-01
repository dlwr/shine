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

function WinnerRow({nominee}: {nominee: PersonAwardNomineeData}) {
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

function NomineeItem({nominee}: {nominee: PersonAwardNomineeData}) {
  return (
    <li className="flex max-w-full flex-wrap items-baseline gap-x-2">
      <a
        href={`/people/${nominee.uid}`}
        className="shrink-0 font-label text-sm leading-tight text-ink no-underline">
        {nominee.name}
      </a>
      {nominee.originalName !== nominee.name && (
        <span className="shrink-0 font-label text-[10px] text-ink-muted">
          {nominee.originalName}
        </span>
      )}
      <MovieLinks movies={nominee.movies} />
    </li>
  );
}

export function PersonAwardYearSection({
  group,
}: {
  group: PersonAwardYearGroupData;
}) {
  const winners = group.nominees.filter(nominee => nominee.isWinner);
  const nominees = group.nominees.filter(nominee => !nominee.isWinner);
  return (
    <AwardYearFrame year={group.year} ceremonyNumber={group.ceremonyNumber}>
      {winners.map(nominee => (
        <WinnerRow key={nominee.uid} nominee={nominee} />
      ))}
      {nominees.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 pb-2">
          {nominees.map(nominee => (
            <NomineeItem key={nominee.uid} nominee={nominee} />
          ))}
        </ul>
      )}
    </AwardYearFrame>
  );
}
