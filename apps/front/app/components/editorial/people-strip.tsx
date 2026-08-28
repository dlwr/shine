import type {ProminentPerson} from '@/lib/people';
import {PersonPortrait} from './person-portrait';

export function PeopleStrip({people}: {people: ProminentPerson[]}) {
  if (people.length === 0) {
    return;
  }

  return (
    <section aria-label="People" className="mb-8">
      <h3 className="font-display text-xl font-black tracking-tight">PEOPLE</h3>
      <ul className="list-none border-b-2 border-ink p-0">
        {people.map(person => (
          <li
            key={person.uid}
            aria-label={person.name}
            className="flex items-center gap-3 border-t-2 border-ink py-2">
            <PersonPortrait
              name={person.name}
              profilePath={person.profilePath}
              className="w-10 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <a
                href={`/people/${person.uid}`}
                className="font-display text-base font-extrabold leading-tight text-ink no-underline">
                {person.name}
              </a>
              {person.originalName !== person.name && (
                <p className="font-mono text-[10px] text-ink-muted">
                  {person.originalName}
                </p>
              )}
              {person.nominatedCount > 0 && (
                <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
                  <span className="font-bold text-brand">
                    {person.wonCount}
                  </span>
                  回受賞 / {person.nominatedCount}回ノミネート
                </p>
              )}
              {person.topMovies.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                  {person.topMovies.map(movie => (
                    <a
                      key={movie.uid}
                      href={`/movies/${movie.uid}`}
                      className="border-b border-ink-muted font-mono text-[10px] text-ink no-underline">
                      {movie.title ?? 'Unknown Title'}
                      {movie.year ? ` ${movie.year}` : ''}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
