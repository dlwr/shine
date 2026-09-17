import type {
  AwardDetail,
  AwardMovieEntry,
  AwardYearGroup,
  PersonAwardNominee,
} from '../types/awards';

const RANK_PATTERN = /^(\d+)位$/;

function rankOf(entry: AwardMovieEntry): number {
  const matched = RANK_PATTERN.exec(entry.specialMention ?? '');
  return matched ? Number(matched[1]) : Infinity;
}

export function compareAwardMovies(
  a: AwardMovieEntry,
  b: AwardMovieEntry,
): number {
  const rankA = rankOf(a);
  const rankB = rankOf(b);

  return rankA === rankB
    ? Number(b.isWinner) - Number(a.isWinner)
    : rankA - rankB;
}

export function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : Number(a > b);
}

export function compareNominees(
  a: PersonAwardNominee,
  b: PersonAwardNominee,
): number {
  return (
    Number(b.isWinner) - Number(a.isWinner) || compareCodePoints(a.name, b.name)
  );
}

const AWARD_LIST_PAGE_SIZE = 100;

function mergeMoviesByUid(
  movies: AwardMovieEntry[],
  byUid: Map<string, AwardMovieEntry>,
): void {
  for (const movie of movies) {
    const existing = byUid.get(movie.uid);
    if (existing) {
      existing.isWinner ||= movie.isWinner;
      continue;
    }

    byUid.set(movie.uid, movie);
  }
}

export function flattenListAward(years: AwardYearGroup[]): AwardYearGroup[] {
  const byUid = new Map<string, AwardMovieEntry>();
  for (const group of years) {
    mergeMoviesByUid(group.movies, byUid);
  }

  const movies = byUid
    .values()
    .toArray()
    .toSorted(
      (a, b) =>
        (b.movieYear ?? 0) - (a.movieYear ?? 0) || (a.uid < b.uid ? -1 : 1),
    );

  return [
    {
      year: years[0].year,
      ceremonyNumber: years[0].ceremonyNumber,
      filmCount: movies.length,
      movies,
    },
  ];
}

/**
 * リスト型の賞をページに切り出す。範囲外のページはundefined(=404)。
 * キャッシュ済みの全件データに対して適用する前提の純粋関数
 */
export function paginateAwardDetail(
  award: AwardDetail,
  page: number,
): AwardDetail | undefined {
  if (award.grouping !== 'list') {
    return award;
  }

  const [group] = award.years;
  const totalCount = group?.filmCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / AWARD_LIST_PAGE_SIZE));
  if (page > totalPages) {
    return undefined;
  }

  const start = (page - 1) * AWARD_LIST_PAGE_SIZE;

  return {
    ...award,
    years: [
      {
        ...group,
        movies: group.movies.slice(start, start + AWARD_LIST_PAGE_SIZE),
      },
    ],
    pagination: {
      page,
      perPage: AWARD_LIST_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}
