import {PersonPortrait} from './person-portrait';

export type PersonAwardMovieData = {
  uid: string;
  title?: string;
  movieYear?: number;
};

export type PersonAwardNomineeData = {
  uid: string;
  name: string;
  originalName: string;
  profilePath?: string;
  isWinner: boolean;
  movies: PersonAwardMovieData[];
};

export type PersonAwardYearGroupData = {
  year: number;
  ceremonyNumber?: number;
  nominees: PersonAwardNomineeData[];
};

function MovieLinks({movies}: {movies: PersonAwardMovieData[]}) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {movies.map(movie => (
        <a
          key={movie.uid}
          href={`/movies/${movie.uid}`}
          className="border-b border-ink-muted font-mono text-[10px] text-ink no-underline">
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
            <span className="font-mono text-[10px] text-ink-muted">
              {nominee.originalName}
            </span>
          )}
          <MovieLinks movies={nominee.movies} />
        </span>
        <span className="shrink-0 bg-brand px-1.5 py-0.5 font-mono text-[9px] text-brand-on">
          WINNER
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <a
        href={`/people/${nominee.uid}`}
        className="shrink-0 font-mono text-sm leading-tight text-ink no-underline">
        {nominee.name}
      </a>
      {nominee.originalName !== nominee.name && (
        <span className="font-mono text-[10px] text-ink-muted">
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
    <section>
      <div className="mb-2 flex items-baseline gap-3 border-t-[3px] border-ink pt-2">
        <h2 className="font-display text-3xl font-black leading-none tracking-[-0.06em] md:text-4xl">
          {group.year}
        </h2>
        {group.ceremonyNumber && (
          <span className="font-mono text-[10px] text-ink-muted">
            第{group.ceremonyNumber}回
          </span>
        )}
      </div>
      <div>
        {group.nominees.map(nominee => (
          <NomineeRow key={nominee.uid} nominee={nominee} />
        ))}
      </div>
    </section>
  );
}
