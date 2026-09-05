import {and, desc, eq, gte, inArray, isNull, lt} from 'drizzle-orm';
import {type getDatabase} from '@shine/database';
import {classifySubmission, type OriginRules} from '@shine/utils';
import {articleLinks} from '@shine/database/schema/article-links';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';

type DatabaseClient = ReturnType<typeof getDatabase>;

export const DEFAULT_MONTHS = 12;

export type MonthlyLinkCount = {
  month: string;
  title: string;
  other: number;
  owner: number;
  test: number;
};

function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00+09:00`);
}

function tokyoDate(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo'}).format(now);
}

function firstDayOfNextMonth(now: Date): string {
  const [year, month] = tokyoDate(now).split('-').map(Number);
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

async function fetchTitles(
  database: DatabaseClient,
  movieUids: string[],
): Promise<Map<string, string>> {
  const rows = await database
    .select({
      resourceUid: translations.resourceUid,
      languageCode: translations.languageCode,
      content: translations.content,
    })
    .from(translations)
    .where(
      and(
        eq(translations.resourceType, 'movie_title'),
        inArray(translations.resourceUid, movieUids),
      ),
    );

  const titles = new Map<string, string>();

  for (const row of rows) {
    const isPreferred =
      row.languageCode === 'ja' || !titles.has(row.resourceUid);

    if (isPreferred) {
      titles.set(row.resourceUid, row.content);
    }
  }

  return titles;
}

export async function collectMonthlyLinkCounts(
  database: DatabaseClient,
  rules: OriginRules,
  options: {months?: number; now?: Date} = {},
): Promise<MonthlyLinkCount[]> {
  const upperBound = firstDayOfNextMonth(options.now ?? new Date());
  const selections = await database
    .select({
      selectionDate: movieSelections.selectionDate,
      movieUid: movies.uid,
    })
    .from(movieSelections)
    .innerJoin(movies, eq(movies.uid, movieSelections.movieId))
    .where(
      and(
        eq(movieSelections.selectionType, 'monthly'),
        isNull(movies.deletedAt),
        lt(movieSelections.selectionDate, upperBound),
      ),
    )
    .orderBy(desc(movieSelections.selectionDate))
    .limit(options.months ?? DEFAULT_MONTHS);

  if (selections.length === 0) {
    return [];
  }

  const movieUids = selections.map(selection => selection.movieUid);
  const [titles, links] = await Promise.all([
    fetchTitles(database, movieUids),
    database
      .select({
        movieUid: articleLinks.movieUid,
        url: articleLinks.url,
        submitterIp: articleLinks.submitterIp,
        submittedAt: articleLinks.submittedAt,
      })
      .from(articleLinks)
      .where(
        and(
          inArray(articleLinks.movieUid, movieUids),
          eq(articleLinks.isSpam, false),
          eq(articleLinks.isFlagged, false),
        ),
      ),
  ]);

  return selections.map(selection => {
    const month = selection.selectionDate.slice(0, 7);
    const since = monthStart(month);
    const count: MonthlyLinkCount = {
      month,
      title: titles.get(selection.movieUid) ?? '(タイトル未登録)',
      other: 0,
      owner: 0,
      test: 0,
    };

    for (const link of links) {
      if (
        link.movieUid !== selection.movieUid ||
        link.submittedAt.getTime() < since.getTime()
      ) {
        continue;
      }

      count[classifySubmission(link, rules)] += 1;
    }

    return count;
  });
}

export function formatNorthStarReport(
  counts: MonthlyLinkCount[],
  now: Date,
): {content: string; hasOutsideLink: boolean} {
  const monthsWithOutsideLink = counts.filter(count => count.other > 0);
  const lines = [
    `北極星（今月の1本に他人が付けたリンク）: ${tokyoDate(now)} 時点`,
    `他人のリンクが付いた月: ${monthsWithOutsideLink.length} / ${counts.length}`,
    ...counts.map(
      count =>
        `${count.month} ${count.title}: 他人 ${count.other} / 本人 ${count.owner} / テスト ${count.test}`,
    ),
  ];

  if (monthsWithOutsideLink.length > 0) {
    lines.splice(
      1,
      0,
      `🎉 他人のリンクが付いた月がある（${monthsWithOutsideLink
        .map(count => count.month)
        .join(', ')}）`,
    );
  }

  return {
    content: lines.join('\n'),
    hasOutsideLink: monthsWithOutsideLink.length > 0,
  };
}

export type MonthlyLinksAnnouncement = {
  movieUid: string;
  title: string;
  year?: number;
  linkUids: string[];
};

export async function findUnannouncedMonthlyLinks(
  database: DatabaseClient,
  rules: OriginRules,
  options: {now?: Date} = {},
): Promise<MonthlyLinksAnnouncement | undefined> {
  const now = options.now ?? new Date();
  const month = tokyoDate(now).slice(0, 7);
  const [selection] = await database
    .select({movieUid: movies.uid, year: movies.year})
    .from(movieSelections)
    .innerJoin(movies, eq(movies.uid, movieSelections.movieId))
    .where(
      and(
        eq(movieSelections.selectionType, 'monthly'),
        eq(movieSelections.selectionDate, `${month}-01`),
        isNull(movies.deletedAt),
      ),
    )
    .limit(1);

  if (!selection) {
    return undefined;
  }

  const links = await database
    .select({
      uid: articleLinks.uid,
      url: articleLinks.url,
      submitterIp: articleLinks.submitterIp,
    })
    .from(articleLinks)
    .where(
      and(
        eq(articleLinks.movieUid, selection.movieUid),
        isNull(articleLinks.announcedAt),
        eq(articleLinks.isSpam, false),
        eq(articleLinks.isFlagged, false),
        gte(articleLinks.submittedAt, monthStart(month)),
      ),
    );

  const linkUids = links
    .filter(link => classifySubmission(link, rules) === 'other')
    .map(link => link.uid);

  if (linkUids.length === 0) {
    return undefined;
  }

  const titles = await fetchTitles(database, [selection.movieUid]);

  return {
    movieUid: selection.movieUid,
    title: titles.get(selection.movieUid) ?? '(タイトル未登録)',
    year: selection.year ?? undefined,
    linkUids,
  };
}

export async function markLinksAnnounced(
  database: DatabaseClient,
  linkUids: string[],
  now: Date = new Date(),
): Promise<void> {
  if (linkUids.length === 0) {
    return;
  }

  await database
    .update(articleLinks)
    .set({announcedAt: now})
    .where(inArray(articleLinks.uid, linkUids));
}
