import type {Route} from './+types/watched.$slug';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {useWatchedList} from '@/components/watched/use-watched-list';
import {WatchedFilmList} from '@/components/watched/watched-film-list';
import {WatchedScore} from '@/components/watched/watched-score';
import {loadApiJson} from '@/lib/api';
import type {AwardDetailData} from '@/lib/api-types';
import {awardHeading} from '@/lib/awards';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {
  buildWatchedShareLine,
  decodeWatched,
  isWatchedEncoding,
  orderWinners,
  watchedListPath,
  watchedStats,
  type WatchedFilm,
} from '@/lib/watched';

export type WatchedListData = {
  slug: string;
  heading: string;
  films: WatchedFilm[];
  shared?: string;
  locale: Locale;
};

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {slug, heading, films, shared, locale} = loaderData as WatchedListData;
  const order = films.map(film => film.uid);
  const path = watchedListPath(slug);

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

  const award = await loadApiJson<AwardDetailData>(
    context,
    `/awards/${params.slug}`,
    {label: 'award', signal: request.signal},
  );
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

export default function WatchedListPage({loaderData}: Route.ComponentProps) {
  const {slug, heading, films, shared} = loaderData as WatchedListData;
  const locale = 'ja';
  const list = useWatchedList({slug, heading, films, shared});

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
          歴代受賞作{list.stats.total}本、何本観た？
        </p>

        <WatchedScore
          films={films}
          displayed={list.displayed}
          stats={list.stats}
          path={list.path}
          viewingShared={list.viewingShared}
          copied={list.copied}
          resetArmed={list.resetArmed}
          onImportShared={list.importShared}
          onShare={list.share}
          onReset={list.reset}
        />

        <WatchedFilmList
          films={films}
          displayed={list.displayed}
          disabled={list.viewingShared}
          onToggle={list.toggle}
        />

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
