import {useEffect, useState} from 'react';
import type {Route} from './+types/watched';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {apiFetch, type LoadContext} from '@/lib/api';
import {awardHeading} from '@/lib/awards';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {orderWinners, readWatched, watchedStats} from '@/lib/watched';

type AwardSummaryResponse = {
  slug: string;
  name: string;
  organization: string;
  grouping: 'year' | 'list' | 'person';
  subAward?: boolean;
  firstYear: number;
  lastYear: number;
};

type AwardDetailResponse = {
  years: Array<{
    year: number;
    movies: Array<{uid: string; isWinner: boolean}>;
  }>;
};

export type WatchedListSummary = {
  slug: string;
  heading: string;
  firstYear: number;
  lastYear: number;
  uids: string[];
};

export type WatchedIndexData = {
  lists: WatchedListSummary[];
  locale: Locale;
};

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = loaderData as {locale?: Locale};

  return buildSocialMeta({
    title: '観た映画チェック | SHINE',
    description:
      'パルム・ドール、アカデミー賞作品賞、キネマ旬報ベスト・テンなど映画賞の歴代受賞作に、観た映画のチェックを付けて何本観たかを共有できます。',
    path: '/watched',
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

async function fetchList(
  context: LoadContext,
  award: AwardSummaryResponse,
  signal: AbortSignal,
): Promise<WatchedListSummary> {
  const response = await apiFetch(context, `/awards/${award.slug}`, {signal});
  if (!response.ok) {
    throw new Response('Failed to load award', {status: 502});
  }

  const detail = (await response.json()) as AwardDetailResponse;

  return {
    slug: award.slug,
    heading: awardHeading(award),
    firstYear: award.firstYear,
    lastYear: award.lastYear,
    uids: orderWinners(detail).map(film => film.uid),
  };
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);

  const response = await apiFetch(context, `/awards`, {signal: request.signal});
  if (!response.ok) {
    throw new Response('Failed to load awards', {status: 502});
  }

  const {awards} = (await response.json()) as {
    awards: AwardSummaryResponse[];
  };
  const lists = await Promise.all(
    awards
      .filter(award => award.grouping === 'year' && !award.subAward)
      .map(async award => fetchList(context, award, request.signal)),
  );

  return {lists, locale} satisfies WatchedIndexData;
}

function yearRange(list: WatchedListSummary): string {
  return list.firstYear === list.lastYear
    ? String(list.firstYear)
    : `${list.firstYear}–${list.lastYear}`;
}

function ListRow({
  list,
  watched,
}: {
  list: WatchedListSummary;
  watched: ReadonlySet<string>;
}) {
  const stats = watchedStats(list.uids, watched);

  return (
    <a
      href={`/watched/${list.slug}`}
      className="block py-3 border-t-2 border-ink no-underline text-ink">
      <span className="flex items-baseline gap-3">
        <span className="flex-1 min-w-0">
          <span className="block font-display font-extrabold text-base md:text-lg leading-tight">
            {list.heading}
          </span>
          <span className="block font-mono text-[10px] text-ink-muted mt-1">
            {yearRange(list)}
          </span>
        </span>
        <span className="font-mono text-xs shrink-0 tabular-nums">
          <span className="font-bold text-brand">{stats.count}</span>
          <span className="text-ink-muted"> / {stats.total}</span>
        </span>
      </span>
      <span className="block h-1.5 border border-ink mt-2">
        <span
          className="block h-full bg-brand"
          style={{width: `${stats.percent}%`}}
        />
      </span>
    </a>
  );
}

export default function WatchedIndexPage({loaderData}: Route.ComponentProps) {
  const {lists} = loaderData as WatchedIndexData;
  const locale = 'ja';
  const [watched, setWatched] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setWatched(readWatched());
  }, []);

  const allUids = [...new Set(lists.flatMap(list => list.uids))];
  const overall = watchedStats(allUids, watched);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          WATCHED
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-6">
          映画賞の歴代受賞作、何本観た？
          チェックはこの端末に保存され、結果は共有URLで見せられる
        </p>

        <section className="border-2 border-ink bg-surface p-4 mb-8">
          <p className="font-mono text-[10px] text-ink-muted mb-2">
            {lists.length}リストの受賞作（重複を除く）
          </p>
          <div className="flex items-end gap-3">
            <span
              data-testid="watched-total-count"
              className="font-display font-black text-5xl md:text-6xl leading-none text-brand tabular-nums">
              {overall.count}
            </span>
            <span className="font-display font-black text-2xl leading-none tabular-nums">
              / {overall.total}
            </span>
            <span className="font-mono text-sm text-ink-muted ml-auto tabular-nums">
              {overall.percent}%
            </span>
          </div>
          <div
            className="h-3 border-2 border-ink mt-3"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={overall.total}
            aria-valuenow={overall.count}>
            <div
              className="h-full bg-brand"
              style={{width: `${overall.percent}%`}}
            />
          </div>
        </section>

        <div>
          {lists.map(list => (
            <ListRow key={list.slug} list={list} watched={watched} />
          ))}
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
