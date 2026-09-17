import {useEffect, useMemo, useState} from 'react';
import {SITE_URL} from '@/lib/meta';
import {
  buildWatchedShareLine,
  buildWatchedShareText,
  decodeWatched,
  encodeWatched,
  mergeWatched,
  readWatched,
  toggleWatched,
  watchedListPath,
  watchedStats,
  writeWatched,
  type WatchedFilm,
} from '@/lib/watched';

export function useWatchedList({
  slug,
  heading,
  films,
  shared,
}: {
  slug: string;
  heading: string;
  films: WatchedFilm[];
  shared?: string;
}) {
  const order = useMemo(() => films.map(film => film.uid), [films]);
  const sharedSet = useMemo(
    () => decodeWatched(order, shared),
    [order, shared],
  );

  const [own, setOwn] = useState<Set<string>>(() => new Set());
  const [restored, setRestored] = useState(false);
  const [viewingShared, setViewingShared] = useState(shared !== undefined);
  const [copied, setCopied] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);

  useEffect(() => {
    setOwn(readWatched());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) {
      writeWatched(own);
    }
  }, [own, restored]);

  const displayed = viewingShared ? sharedSet : own;
  const stats = watchedStats(order, displayed);
  const path = watchedListPath(slug);

  function toggle(uid: string) {
    setCopied(false);
    setOwn(current => toggleWatched(current, uid));
  }

  function importShared() {
    setOwn(current => mergeWatched(current, sharedSet));
    setViewingShared(false);
    globalThis.history?.replaceState(undefined, '', path);
  }

  async function share() {
    const url = `${SITE_URL}${path}?s=${encodeWatched(order, own)}`;
    const line = buildWatchedShareLine({heading, ...stats});

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({title: heading, text: line, url});
        return;
      } catch {
        // 共有シートを閉じた場合などはクリップボードに落とす
      }
    }

    try {
      await navigator.clipboard.writeText(
        buildWatchedShareText({heading, ...stats, url}),
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function reset() {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }

    setOwn(
      current => new Set([...current].filter(uid => !order.includes(uid))),
    );
    setResetArmed(false);
  }

  return {
    path,
    displayed,
    stats,
    viewingShared,
    copied,
    resetArmed,
    toggle,
    importShared,
    share,
    reset,
  };
}
