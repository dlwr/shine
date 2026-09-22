import {useEffect, useState} from 'react';
import {getAdminToken} from '@/lib/admin-fetch';
import {readWatched, toggleWatched, writeWatched} from '@/lib/watched';

function sendWatchedMark(apiUrl: string, uid: string): void {
  const token = getAdminToken();
  void fetch(`${apiUrl}/movies/${uid}/watched`, {
    method: 'POST',
    headers: token ? {Authorization: `Bearer ${token}`} : {},
  }).catch(() => {});
}

export function WatchedToggle({
  uid,
  isMonthlyPick = false,
  apiUrl,
}: {
  uid: string;
  isMonthlyPick?: boolean;
  apiUrl?: string;
}) {
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    setWatched(readWatched().has(uid));
  }, [uid]);

  function toggle() {
    const next = toggleWatched(readWatched(), uid);
    writeWatched(next);
    setWatched(next.has(uid));
    if (apiUrl && next.has(uid)) {
      sendWatchedMark(apiUrl, uid);
    }
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
      {watched && isMonthlyPick && (
        <a
          href="#article-links"
          className="font-mono text-xs font-bold text-brand underline underline-offset-2">
          今月の1本を観ましたね。ひとこと残す ↓
        </a>
      )}
      {watched && !isMonthlyPick && (
        <a href="/watched" className="font-mono text-[10px] text-ink-muted">
          観た映画チェックで進捗を見る →
        </a>
      )}
    </div>
  );
}
