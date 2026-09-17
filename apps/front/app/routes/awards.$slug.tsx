import type {Route} from './+types/awards.$slug';
import {Masthead} from '@/components/editorial/masthead';
import {PersonAwardYearSection} from '@/components/editorial/person-award-years';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {awardHeading} from '@/lib/awards';
import {
  awardPagePath,
  awardPageTitle,
  awardSummaryLine,
  buildAwardItemList,
  type AwardDetailData,
  type AwardMovieEntryData,
  type AwardPageData,
  type AwardPaginationData,
  type AwardYearGroupData,
} from '@/lib/award-page';
import {apiFetch} from '@/lib/api';

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {award, locale} = loaderData as {
    award: AwardPageData;
    locale?: Locale;
  };
  const title = awardPageTitle(award);

  return [
    ...buildSocialMeta({
      title,
      description: award.description,
      path: awardPagePath(award),
      locale: locale ?? DEFAULT_LOCALE,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    {'script:ld+json': buildAwardItemList(award)},
  ];
}

export async function loader({context, request, params}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);

  const page = new URL(request.url).searchParams.get('page') ?? '1';
  const response = await apiFetch(
    context,
    `/awards/${params.slug}?page=${encodeURIComponent(page)}`,
    {signal: request.signal},
  );

  if (response.status === 404) {
    throw new Response('Not Found', {status: 404});
  }

  if (!response.ok) {
    throw new Response('Failed to load award', {status: 502});
  }

  const award = (await response.json()) as AwardPageData;
  return {award, locale};
}

function RankLabel({rank}: {rank: string}) {
  return (
    <span className="font-mono text-[10px] text-ink-muted w-7 shrink-0 tabular-nums">
      {rank}
    </span>
  );
}

export function MovieRow({movie}: {movie: AwardMovieEntryData}) {
  const title = movie.title ?? 'Unknown Title';

  if (movie.isWinner) {
    return (
      <a
        href={`/movies/${movie.uid}`}
        className="flex items-center gap-4 py-3 no-underline text-ink">
        {movie.specialMention && <RankLabel rank={movie.specialMention} />}
        <PosterFrame
          posterUrl={movie.posterUrl}
          alt={`${title} poster`}
          className="w-16 shrink-0"
          displaySize="w185"
        />
        <span className="flex-1 font-display font-extrabold text-base md:text-lg leading-tight">
          {title}
        </span>
        {!movie.specialMention && (
          <span className="font-mono text-[9px] bg-brand text-brand-on px-1.5 py-0.5 shrink-0">
            WINNER
          </span>
        )}
      </a>
    );
  }

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex items-center gap-4 py-1.5 no-underline text-ink">
      {movie.specialMention && <RankLabel rank={movie.specialMention} />}
      <span className="flex-1 font-mono text-sm leading-tight">{title}</span>
    </a>
  );
}

function ListRow({movie}: {movie: AwardMovieEntryData}) {
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
      <span className="flex-1 font-display font-extrabold text-sm leading-none">
        {title}
      </span>
      {movie.movieYear && (
        <span className="font-mono text-xs text-ink-muted shrink-0">
          {movie.movieYear}
        </span>
      )}
    </a>
  );
}

function YearSection({
  award,
  group,
}: {
  award: AwardDetailData;
  group: AwardYearGroupData;
}) {
  const yearHref = `/awards/${award.slug}/${group.year}`;

  return (
    <section>
      <div className="flex items-baseline gap-3 border-t-[3px] border-ink pt-2 mb-2">
        <h2 className="font-display font-black text-3xl md:text-4xl tracking-[-0.06em] leading-none">
          <a href={yearHref} className="text-ink no-underline">
            {group.year}
          </a>
        </h2>
        {group.ceremonyNumber && (
          <span className="font-mono text-[10px] text-ink-muted">
            第{group.ceremonyNumber}回
          </span>
        )}
        {group.filmCount > group.movies.length && (
          <a
            href={yearHref}
            className="ml-auto font-mono text-[10px] text-ink-muted no-underline shrink-0">
            出品作{group.filmCount}本を見る →
          </a>
        )}
      </div>
      <div>
        {group.movies.length > 0 ? (
          group.movies.map(movie => <MovieRow key={movie.uid} movie={movie} />)
        ) : (
          <p className="font-mono text-xs text-ink-muted py-3">受賞作なし</p>
        )}
      </div>
    </section>
  );
}

function Pagination({
  award,
  pagination,
}: {
  award: AwardDetailData;
  pagination: AwardPaginationData;
}) {
  if (pagination.totalPages <= 1) {
    return;
  }

  const pageHref = (page: number) =>
    page === 1 ? `/awards/${award.slug}` : `/awards/${award.slug}?page=${page}`;

  return (
    <nav className="flex items-center justify-between gap-4 border-t-2 border-ink pt-4 mt-6 font-mono text-xs">
      {pagination.page > 1 ? (
        <a href={pageHref(pagination.page - 1)} className="text-ink">
          ← 前の{pagination.perPage}件
        </a>
      ) : (
        <span />
      )}
      <span className="text-ink-muted">
        {pagination.page} / {pagination.totalPages}
      </span>
      {pagination.page < pagination.totalPages ? (
        <a href={pageHref(pagination.page + 1)} className="text-ink">
          次の{pagination.perPage}件 →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

function AwardBody({award}: {award: AwardPageData}) {
  if (award.grouping === 'person') {
    return (
      <div className="space-y-10">
        {award.years.map(group => (
          <PersonAwardYearSection key={group.year} group={group} />
        ))}
      </div>
    );
  }

  if (award.grouping === 'year') {
    return (
      <div className="space-y-10">
        {award.years.map(group => (
          <YearSection key={group.year} award={award} group={group} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {award.years.flatMap(group =>
        group.movies.map(movie => <ListRow key={movie.uid} movie={movie} />),
      )}
      {award.pagination && (
        <Pagination award={award} pagination={award.pagination} />
      )}
    </div>
  );
}

export default function AwardDetailPage({loaderData}: Route.ComponentProps) {
  const {award} = loaderData as {award: AwardPageData};
  const locale = 'ja';
  const heading = awardHeading(award);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <nav className="font-mono text-[10px] text-ink-muted mb-4">
          <a href="/awards" className="text-ink-muted">
            AWARDS & LISTS
          </a>
        </nav>

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          {heading}
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-4">
          {awardSummaryLine(award)}
        </p>

        {award.grouping === 'year' && !award.subAward && (
          <a
            href={`/watched/${award.slug}`}
            className="inline-block mb-8 border-2 border-ink px-3 py-1.5 font-mono text-xs font-bold no-underline text-ink shadow-[3px_3px_0_var(--brand)]">
            受賞作、何本観た？ →
          </a>
        )}

        <AwardBody award={award} />

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
