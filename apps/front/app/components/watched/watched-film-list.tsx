import {PosterFrame} from '@/components/editorial/poster-frame';
import {groupWatchedByYear, type WatchedFilm} from '@/lib/watched';

function FilmRow({
  film,
  checked,
  disabled,
  onToggle,
}: {
  film: WatchedFilm;
  checked: boolean;
  disabled: boolean;
  onToggle: (uid: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-t-2 border-ink">
      <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={film.title}
          onChange={() => {
            onToggle(film.uid);
          }}
          className="w-5 h-5 shrink-0 accent-brand"
        />
        <PosterFrame
          posterUrl={film.posterUrl}
          alt=""
          className="w-10 shrink-0"
          displaySize="w185"
        />
        <span
          className={`font-display font-extrabold text-sm md:text-base leading-tight ${
            checked ? 'text-ink' : 'text-ink-muted'
          }`}>
          {film.title}
        </span>
      </label>
      <a
        href={`/movies/${film.uid}`}
        className="font-mono text-[10px] text-ink-muted no-underline shrink-0">
        詳細 →
      </a>
    </div>
  );
}

export function WatchedFilmList({
  films,
  displayed,
  disabled,
  onToggle,
}: {
  films: WatchedFilm[];
  displayed: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (uid: string) => void;
}) {
  return (
    <div className="space-y-8">
      {groupWatchedByYear(films).map(group => (
        <section key={group.year}>
          <h2 className="font-display font-black text-3xl md:text-4xl tracking-[-0.06em] leading-none mb-2">
            {group.year}
          </h2>
          {group.films.map(film => (
            <FilmRow
              key={film.uid}
              film={film}
              checked={displayed.has(film.uid)}
              disabled={disabled}
              onToggle={onToggle}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
