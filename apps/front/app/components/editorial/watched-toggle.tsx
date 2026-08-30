import {useEffect, useState} from 'react';
import {readWatched, toggleWatched, writeWatched} from '@/lib/watched';

export function WatchedToggle({uid}: {uid: string}) {
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    setWatched(readWatched().has(uid));
  }, [uid]);

  function toggle() {
    const next = toggleWatched(readWatched(), uid);
    writeWatched(next);
    setWatched(next.has(uid));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={watched}
        onClick={toggle}
        className={
          watched
            ? 'font-mono text-xs font-bold bg-brand text-brand-on px-2.5 py-1 border-2 border-ink shadow-[3px_3px_0_var(--ink)]'
            : 'font-mono text-xs font-bold px-2.5 py-1 border-2 border-ink text-ink'
        }>
        {watched ? '✓ 観た' : '観た'}
      </button>
      {watched && (
        <a href="/watched" className="font-mono text-[10px] text-ink-muted">
          観た映画チェックで進捗を見る →
        </a>
      )}
    </div>
  );
}
