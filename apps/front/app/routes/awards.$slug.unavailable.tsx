import type {Route} from './+types/awards.$slug.unavailable';
import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {NOINDEX_FOLLOW, SITE_URL, buildSocialMeta} from '@/lib/meta';
import {awardHeading} from '@/lib/awards';
import type {
  AwardUnavailableListData,
  AwardUnavailableMovieData,
} from '@/lib/api-types';
import {loadApiJson} from '@/lib/api';

const STRUCTURED_DATA_ITEM_LIMIT = 100;

export function unavailablePageTitle(list: AwardUnavailableListData): string {
  return `${awardHeading(list)} 日本で観られない${list.movies.length}本 | SHINE`;
}

export function unavailablePageDescription(
  list: AwardUnavailableListData,
): string {
  const {total} = list.availabilitySummary;
  return `${awardHeading(list)}の受賞作・ノミネート作${total}本のうち、配信にも宅配レンタルにも無く日本で観られない${list.movies.length}本の一覧。授賞式の年の新しい順。`;
}

function buildItemList(
  list: AwardUnavailableListData,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${awardHeading(list)} 日本で観られない映画`,
    itemListElement: list.movies
      .slice(0, STRUCTURED_DATA_ITEM_LIMIT)
      .map((movie, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}/movies/${movie.uid}`,
        name: movie.title,
      })),
  };
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {list, locale} = loaderData as {
    list: AwardUnavailableListData;
    locale?: Locale;
  };

  return [
    ...buildSocialMeta({
      title: unavailablePageTitle(list),
      description: unavailablePageDescription(list),
      path: `/awards/${list.slug}/unavailable`,
      locale: locale ?? DEFAULT_LOCALE,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    ...(list.movies.length === 0 ? [NOINDEX_FOLLOW] : []),
    {'script:ld+json': buildItemList(list)},
  ];
}

export async function loader({context, request, params}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);

  const list = await loadApiJson<AwardUnavailableListData>(
    context,
    `/awards/${params.slug}/unavailable`,
    {label: 'award unavailable', signal: request.signal},
  );
  return {list, locale};
}

function UnavailableRow({movie}: {movie: AwardUnavailableMovieData}) {
  const title = movie.title ?? 'Unknown Title';

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex items-center gap-3 py-2 border-t-2 border-ink no-underline text-ink">
      <PosterFrame
        posterUrl={movie.posterUrl}
        alt={`${title} poster`}
        className="w-9 shrink-0"
        displaySize="w185"
      />
      <span className="flex-1 min-w-0">
        <span className="block font-display font-extrabold text-sm leading-tight">
          {title}
        </span>
        <span className="block font-label text-[10px] text-ink-muted mt-1">
          {movie.ceremonyYears.join(' / ')}
          {movie.movieYear ? `・${movie.movieYear}年` : ''}
        </span>
      </span>
      {movie.isWinner && (
        <span className="shrink-0 border border-brand px-1.5 py-0.5 font-display text-xs leading-none text-brand">
          受賞
        </span>
      )}
    </a>
  );
}

export default function AwardUnavailablePage({
  loaderData,
}: Route.ComponentProps) {
  const {list} = loaderData as {list: AwardUnavailableListData};
  const locale = 'ja';
  const heading = awardHeading(list);
  const {total, watchable} = list.availabilitySummary;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <nav className="font-label text-[10px] text-ink-muted mb-4">
          <a href="/awards" className="text-ink-muted">
            映画賞・リスト
          </a>
          {' / '}
          <a href={`/awards/${list.slug}`} className="text-ink-muted">
            {heading}
          </a>
        </nav>

        <h1 className="font-display font-bold text-2xl md:text-3xl mb-2">
          日本で観られない {list.movies.length} 本
        </h1>
        <p className="font-label text-xs text-ink-muted mb-8">
          {heading} 全 {total} 本・観られる {watchable} 本
        </p>

        <section className="mb-10 border-t-2 border-b-2 border-ink py-4">
          <p className="font-display text-sm md:text-base leading-relaxed">
            配信にも宅配レンタルにも見つからなかった受賞作・ノミネート作。
            <br />
            確認した時点の結果なので、配信が始まっていたら映画ページから教えてください。
          </p>
        </section>

        {list.movies.length > 0 ? (
          <div className="border-b-2 border-ink">
            {list.movies.map(movie => (
              <UnavailableRow key={movie.uid} movie={movie} />
            ))}
          </div>
        ) : (
          <p className="font-label text-xs text-ink-muted py-3">
            観られない作品はありません
          </p>
        )}

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
