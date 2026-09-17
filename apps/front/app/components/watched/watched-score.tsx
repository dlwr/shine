import type {WatchedFilm, WatchedStats} from '@/lib/watched';

const PRIMARY_BUTTON =
  'font-mono text-xs font-bold bg-brand text-brand-on px-3 py-1.5 border-2 border-ink shadow-[3px_3px_0_var(--ink)]';
const SECONDARY_BUTTON =
  'font-mono text-xs font-bold px-3 py-1.5 border-2 border-ink text-ink no-underline';

function WatchedGrid({
  films,
  watched,
}: {
  films: WatchedFilm[];
  watched: ReadonlySet<string>;
}) {
  return (
    <div className="flex flex-wrap gap-1 mt-4" aria-hidden="true">
      {films.map(film => (
        <span
          key={film.uid}
          title={`${film.year} ${film.title}`}
          className={`block w-3 h-3 border border-ink ${
            watched.has(film.uid) ? 'bg-brand' : 'bg-surface'
          }`}
        />
      ))}
    </div>
  );
}

export function WatchedScore({
  films,
  displayed,
  stats,
  path,
  viewingShared,
  copied,
  resetArmed,
  onImportShared,
  onShare,
  onReset,
}: {
  films: WatchedFilm[];
  displayed: ReadonlySet<string>;
  stats: WatchedStats;
  path: string;
  viewingShared: boolean;
  copied: boolean;
  resetArmed: boolean;
  onImportShared: () => void;
  onShare: () => Promise<void>;
  onReset: () => void;
}) {
  return (
    <section className="border-2 border-ink bg-surface p-4 mb-8">
      {viewingShared && (
        <p className="font-mono text-[10px] text-ink-muted mb-2">
          共有された結果を見ています
        </p>
      )}
      <div className="flex items-end gap-3">
        <span
          data-testid="watched-count"
          className="font-display font-black text-5xl md:text-6xl leading-none text-brand tabular-nums">
          {stats.count}
        </span>
        <span className="font-display font-black text-2xl leading-none tabular-nums">
          / {stats.total}
        </span>
        <span className="font-mono text-sm text-ink-muted ml-auto tabular-nums">
          {stats.percent}%
        </span>
      </div>
      <div
        className="h-3 border-2 border-ink mt-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stats.total}
        aria-valuenow={stats.count}>
        <div className="h-full bg-brand" style={{width: `${stats.percent}%`}} />
      </div>
      <WatchedGrid films={films} watched={displayed} />
      <div className="flex flex-wrap gap-2 mt-4">
        {viewingShared ? (
          <>
            <button
              type="button"
              onClick={onImportShared}
              className={PRIMARY_BUTTON}>
              この結果を引き継ぐ
            </button>
            <a href={path} className={SECONDARY_BUTTON}>
              自分もやる
            </a>
          </>
        ) : (
          <>
            <button type="button" onClick={onShare} className={PRIMARY_BUTTON}>
              {copied ? 'コピーしました' : '結果を共有'}
            </button>
            <button
              type="button"
              onClick={onReset}
              className={SECONDARY_BUTTON}>
              {resetArmed ? '本当に消す' : 'このリストのチェックを消す'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
