import type {AvailabilityInfo} from '@/components/editorial/availability-badges';
import type {PersonAwardYearGroupData} from '@/components/editorial/person-award-years';
import {awardHeading} from '@/lib/awards';
import {SITE_URL} from '@/lib/meta';

export type AwardMovieEntryData = {
  uid: string;
  title?: string;
  movieYear?: number;
  posterUrl?: string;
  isWinner: boolean;
  specialMention?: string;
  availability?: AvailabilityInfo[];
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
  subAward?: boolean;
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

export function buildAwardItemList(
  award: AwardPageData,
): Record<string, unknown> {
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

export function awardPagePath(award: AwardPageData): string {
  const page = award.grouping === 'person' ? 1 : (award.pagination?.page ?? 1);
  return page > 1
    ? `/awards/${award.slug}?page=${page}`
    : `/awards/${award.slug}`;
}

export function awardPageTitle(award: AwardPageData): string {
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

export function awardSummaryLine(award: AwardPageData): string {
  const {first, last} = yearRange(award);

  if (award.grouping === 'person') {
    return `${first}–${last} / ${countPersonWinners(award)} WINNERS / ${countNominees(award)} NOMINEES`;
  }

  if (award.grouping === 'year') {
    return `${first}–${last} / ${countWinners(award)} WINNERS / ${countMovies(award)} FILMS`;
  }

  return `${countMovies(award)} FILMS`;
}
