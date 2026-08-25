import type {Route} from './+types/awards.$slug';
import {Masthead} from '@/components/editorial/masthead';
import {
  PersonAwardYearSection,
  type PersonAwardYearGroupData,
} from '@/components/editorial/person-award-years';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {awardHeading} from '@/lib/awards';
import {resolveApiUrl} from '@/lib/api';

export type AwardMovieEntryData = {
  uid: string;
  title?: string;
  movieYear?: number;
  posterUrl?: string;
  isWinner: boolean;
  specialMention?: string;
};

export type AwardYearGroupData = {
  year: number;
  ceremonyNumber?: number;
  filmCount: number;
  movies: AwardMovieEntryData[];
};

export type AwardPaginationData = {
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
};

export type AwardDetailData = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list';
  years: AwardYearGroupData[];
  pagination?: AwardPaginationData;
};

export type PersonAwardDetailData = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  grouping: 'person';
  years: PersonAwardYearGroupData[];
};

export type AwardPageData = AwardDetailData | PersonAwardDetailData;

const STRUCTURED_DATA_ITEM_LIMIT = 100;

function yearRange(award: AwardPageData): {first?: number; last?: number} {
  return {first: award.years.at(-1)?.year, last: award.years[0]?.year};
}

function countNominees(award: PersonAwardDetailData): number {
  let count = 0;
  for (const group of award.years) {
    count += group.nominees.length;
  }

  return count;
}

function countPersonWinners(award: PersonAwardDetailData): number {
  let count = 0;
  for (const group of award.years) {
    count += group.nominees.filter(nominee => nominee.isWinner).length;
  }

  return count;
}

function countMovies(award: AwardDetailData): number {
  let count = 0;
  for (const group of award.years) {
    count += group.filmCount;
  }

  return count;
}

function countWinners(award: AwardDetailData): number {
  let count = 0;
  for (const group of award.years) {
    count += group.movies.length;
  }

  return count;
}

function buildItemList(award: AwardPageData): Record<string, unknown> {
  const items =
    award.grouping === 'person'
      ? award.years.flatMap(group =>
          group.nominees
            .filter(nominee => nominee.isWinner)
            .map(nominee => ({
              url: `${SITE_URL}/people/${nominee.uid}`,
              name: nominee.name,
            })),
        )
      : award.years.flatMap(group =>
          group.movies.map(movie => ({
            url: `${SITE_URL}/movies/${movie.uid}`,
            name: movie.title,
          })),
        );
  const pagination = award.grouping === 'person' ? undefined : award.pagination;
  const offset = pagination ? (pagination.page - 1) * pagination.perPage : 0;

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: awardHeading(award),
    itemListElement: items
      .slice(0, STRUCTURED_DATA_ITEM_LIMIT)
      .map((item, index) => ({
        '@type': 'ListItem',
        position: offset + index + 1,
        ...item,
      })),
  };
}

function awardPath(award: AwardPageData): string {
  const page = award.grouping === 'person' ? 1 : (award.pagination?.page ?? 1);
  return page > 1
    ? `/awards/${award.slug}?page=${page}`
    : `/awards/${award.slug}`;
}

function pageTitle(award: AwardPageData): string {
  const heading = awardHeading(award);
  const {first, last} = yearRange(award);

  if (award.grouping === 'person') {
    return `${heading} 歴代受賞者一覧（${first}–${last}） | SHINE`;
  }

  if (award.grouping === 'year') {
    return `${heading} 歴代受賞作一覧（${first}–${last}） | SHINE`;
  }

  const page = award.pagination?.page ?? 1;
  const pageSuffix = page > 1 ? `（${page}ページ目）` : '';
  return `${heading} 全${countMovies(award)}作品${pageSuffix} | SHINE`;
}

function summaryLine(award: AwardPageData): string {
  const {first, last} = yearRange(award);

  if (award.grouping === 'person') {
    return `${first}–${last} / ${countPersonWinners(award)} WINNERS / ${countNominees(award)} NOMINEES`;
  }

  if (award.grouping === 'year') {
    return `${first}–${last} / ${countWinners(award)} WINNERS / ${countMovies(award)} FILMS`;
  }

  return `${countMovies(award)} FILMS`;
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {award, locale} = loaderData as {
    award: AwardPageData;
    locale?: Locale;
  };
  const title = pageTitle(award);

  return [
    ...buildSocialMeta({
      title,
      description: award.description,
      path: awardPath(award),
      locale: locale ?? DEFAULT_LOCALE,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    {'script:ld+json': buildItemList(award)},
  ];
}

export async function loader({context, request, params}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl = resolveApiUrl(context);

  const page = new URL(request.url).searchParams.get('page') ?? '1';
  const response = await fetch(
    `${apiUrl}/awards/${params.slug}?page=${encodeURIComponent(page)}`,
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
        <a
          href={yearHref}
          className="ml-auto font-mono text-[10px] text-ink-muted no-underline shrink-0">
          出品作{group.filmCount}本を見る →
        </a>
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
        <p className="font-mono text-xs text-ink-muted mb-8">
          {summaryLine(award)}
        </p>

        <AwardBody award={award} />

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
