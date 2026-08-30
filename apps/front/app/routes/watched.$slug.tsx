import {useEffect, useMemo, useState} from 'react';
import type {Route} from './+types/watched.$slug';
import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {resolveApiUrl} from '@/lib/api';
import {awardHeading} from '@/lib/awards';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {
  buildWatchedShareLine,
  buildWatchedShareText,
  decodeWatched,
  encodeWatched,
  isWatchedEncoding,
  mergeWatched,
  orderWinners,
  readWatched,
  toggleWatched,
  watchedStats,
  writeWatched,
  type WatchedFilm,
} from '@/lib/watched';

type AwardResponse = {
  slug: string;
  name: string;
  organization: string;
  grouping: 'year' | 'list' | 'person';
  subAward?: boolean;
  years: Array<{
    year: number;
    movies: Array<{
      uid: string;
      title?: string;
      movieYear?: number;
      posterUrl?: string;
      isWinner: boolean;
    }>;
  }>;
};

export type WatchedListData = {
  slug: string;
  heading: string;
  films: WatchedFilm[];
  shared?: string;
  locale: Locale;
};

function listPath(slug: string): string {
  return `/watched/${slug}`;
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {slug, heading, films, shared, locale} = loaderData as WatchedListData;
  const order = films.map(film => film.uid);
  const path = listPath(slug);

  if (shared) {
    const stats = watchedStats(order, decodeWatched(order, shared));
    const query = `s=${encodeURIComponent(shared)}`;

    return buildSocialMeta({
      title: `${heading}の受賞作、${stats.total}本中${stats.count}本観てた | SHINE`,
      description: `${buildWatchedShareLine({heading, ...stats})}。あなたは何本観た？`,
      path: `${path}?${query}`,
      locale: locale ?? DEFAULT_LOCALE,
      imageUrl: `${SITE_URL}/og/watched.png?slug=${slug}&${query}`,
      largeImage: true,
    });
  }

  return buildSocialMeta({
    title: `${heading}受賞作、何本観た？ | SHINE`,
    description: `${heading}の歴代受賞作${order.length}本にチェックを付けて、観た本数と割合を共有できます。`,
    path,
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/watched.png?slug=${slug}`,
    largeImage: true,
  });
}

export async function loader({context, request, params}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl = resolveApiUrl(context);

  const response = await fetch(`${apiUrl}/awards/${params.slug}`, {
    signal: request.signal,
  });
  if (response.status === 404) {
    throw new Response('Not Found', {status: 404});
  }

  if (!response.ok) {
    throw new Response('Failed to load award', {status: 502});
  }

  const award = (await response.json()) as AwardResponse;
  if (award.grouping !== 'year' || award.subAward) {
    throw new Response('Not Found', {status: 404});
  }

  const shared = new URL(request.url).searchParams.get('s');

  return {
    slug: award.slug,
    heading: awardHeading(award),
    films: orderWinners(award),
    shared: isWatchedEncoding(shared) ? (shared ?? undefined) : undefined,
    locale,
  } satisfies WatchedListData;
}

function groupByYear(
  films: WatchedFilm[],
): Array<{year: number; films: WatchedFilm[]}> {
  const groups = new Map<number, WatchedFilm[]>();
  for (const film of films) {
    const group = groups.get(film.year);
    if (group) {
      group.push(film);
    } else {
      groups.set(film.year, [film]);
    }
  }

  return [...groups]
    .map(([year, group]) => ({year, films: group}))
    .toSorted((a, b) => b.year - a.year);
}

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

const PRIMARY_BUTTON =
  'font-mono text-xs font-bold bg-brand text-brand-on px-3 py-1.5 border-2 border-ink shadow-[3px_3px_0_var(--ink)]';
const SECONDARY_BUTTON =
  'font-mono text-xs font-bold px-3 py-1.5 border-2 border-ink text-ink no-underline';

export default function WatchedListPage({loaderData}: Route.ComponentProps) {
  const {slug, heading, films, shared} = loaderData as WatchedListData;
  const locale = 'ja';
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
  const groups = groupByYear(films);
  const path = listPath(slug);

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

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <nav className="font-mono text-[10px] text-ink-muted mb-4">
          <a href="/watched" className="text-ink-muted">
            WATCHED
          </a>
        </nav>

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          {heading}
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-6">
          歴代受賞作{stats.total}本、何本観た？
        </p>

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
            <div
              className="h-full bg-brand"
              style={{width: `${stats.percent}%`}}
            />
          </div>
          <WatchedGrid films={films} watched={displayed} />
          <div className="flex flex-wrap gap-2 mt-4">
            {viewingShared ? (
              <>
                <button
                  type="button"
                  onClick={importShared}
                  className={PRIMARY_BUTTON}>
                  この結果を引き継ぐ
                </button>
                <a href={path} className={SECONDARY_BUTTON}>
                  自分もやる
                </a>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={share}
                  className={PRIMARY_BUTTON}>
                  {copied ? 'コピーしました' : '結果を共有'}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className={SECONDARY_BUTTON}>
                  {resetArmed ? '本当に消す' : 'このリストのチェックを消す'}
                </button>
              </>
            )}
          </div>
        </section>

        <div className="space-y-8">
          {groups.map(group => (
            <section key={group.year}>
              <h2 className="font-display font-black text-3xl md:text-4xl tracking-[-0.06em] leading-none mb-2">
                {group.year}
              </h2>
              {group.films.map(film => (
                <FilmRow
                  key={film.uid}
                  film={film}
                  checked={displayed.has(film.uid)}
                  disabled={viewingShared}
                  onToggle={toggle}
                />
              ))}
            </section>
          ))}
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
