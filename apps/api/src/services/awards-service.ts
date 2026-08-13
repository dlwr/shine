import {and, eq, inArray, isNull, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {BaseService} from './base-service';
import type {
  AwardDetail,
  AwardMovieEntry,
  AwardSummary,
  AwardYearDetail,
  AwardYearGroup,
} from '@shine/types';

export function awardPageLinkForOrganizationName(organizationName: string): {
  slug: string | undefined;
  hasYearPages: boolean;
} {
  const definition = awardPageDefinitions.find(
    entry => entry.organizationName === organizationName,
  );

  return {
    slug: definition?.slug,
    hasYearPages: definition?.grouping === 'year',
  };
}

type AwardPageDefinition = {
  slug: string;
  organizationName: string;
  categoryNames: string[];
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list';
};

export const awardPageDefinitions: AwardPageDefinition[] = [
  {
    slug: 'palme-dor',
    organizationName: 'Cannes Film Festival',
    categoryNames: ["Palme d'Or"],
    name: 'パルム・ドール',
    organization: 'カンヌ国際映画祭',
    description:
      'カンヌ国際映画祭の最高賞パルム・ドールの歴代受賞作と公式出品作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'academy-best-picture',
    organizationName: 'Academy Awards',
    categoryNames: ['Academy Award for Best Picture'],
    name: '作品賞',
    organization: 'アカデミー賞',
    description:
      'アカデミー賞（オスカー）作品賞の歴代受賞作とノミネート作品の一覧。',
    grouping: 'year',
  },
  {
    slug: 'japan-academy-best-picture',
    organizationName: 'Japan Academy Awards',
    categoryNames: ['最優秀作品賞', '優秀作品賞'],
    name: '最優秀作品賞',
    organization: '日本アカデミー賞',
    description:
      '日本アカデミー賞 最優秀作品賞の歴代受賞作と優秀作品賞ノミネートの一覧。',
    grouping: 'year',
  },
  {
    slug: '1001-movies',
    organizationName: '1001 Movies You Must See Before You Die',
    categoryNames: ['Selected Films'],
    name: '死ぬまでに観たい映画1001本',
    organization: '1001 Movies You Must See Before You Die',
    description: '書籍『死ぬまでに観たい映画1001本』に選ばれた映画の一覧。',
    grouping: 'list',
  },
  {
    slug: 'popeye-21st-century',
    organizationName: 'POPEYE',
    categoryNames: [
      '21ST CENTURY MOVIE GREATEST HITS (POPEYE ISSUE 944 DECEMBER 2025)',
    ],
    name: '21st Century Movie Greatest Hits',
    organization: 'POPEYE',
    description:
      '雑誌POPEYE（No. 944）の特集「21ST CENTURY MOVIE GREATEST HITS」で選ばれた映画の一覧。',
    grouping: 'list',
  },
  {
    slug: 'brutus-japanese-film',
    organizationName: 'BRUTUS',
    categoryNames: ['美しき、日本映画。(BRUTUS No. 1043)'],
    name: '美しき、日本映画。',
    organization: 'BRUTUS',
    description:
      '雑誌BRUTUS（No. 1043）の特集「美しき、日本映画。」で選ばれた映画の一覧。',
    grouping: 'list',
  },
  {
    slug: 'variety-top-100',
    organizationName: 'Variety',
    categoryNames: ['Top 100 Greatest Movies of All Time'],
    name: 'Top 100 Greatest Movies of All Time',
    organization: 'Variety',
    description:
      'Variety誌が選ぶ「史上最高の映画トップ100」に選ばれた映画の一覧。',
    grouping: 'list',
  },
  {
    slug: 'time-underappreciated',
    organizationName: 'TIME',
    categoryNames: ['The 50 Most Underappreciated Movies of the 21st Century'],
    name: 'The 50 Most Underappreciated Movies of the 21st Century',
    organization: 'TIME',
    description:
      'TIME誌が選ぶ「過小評価された21世紀の映画50本」に選ばれた映画の一覧。',
    grouping: 'list',
  },
  {
    slug: 'ign-japan-starter-pack',
    organizationName: 'IGN Japan',
    categoryNames: ['スターターパック&スキルツリー'],
    name: 'スターターパック&スキルツリー',
    organization: 'IGN Japan',
    description:
      'IGN Japanの映画特集「スターターパック&スキルツリー」で選ばれた映画の一覧。',
    grouping: 'list',
  },
];

export class AwardsService extends BaseService {
  async getAwardBySlug(slug: string): Promise<AwardDetail | undefined> {
    const definition = awardPageDefinitions.find(entry => entry.slug === slug);
    if (!definition) {
      return undefined;
    }

    const categoryUids = await this.resolveCategoryUids(definition);
    if (categoryUids.length === 0) {
      return undefined;
    }

    const rows = await this.database
      .select({
        movieUid: movies.uid,
        movieYear: movies.year,
        isWinner: nominations.isWinner,
        ceremonyYear: awardCeremonies.year,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        jaTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
            AND translations.language_code = 'ja'
          LIMIT 1
        )`.as('jaTitle'),
        defaultTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
          ORDER BY translations.is_default DESC
          LIMIT 1
        )`.as('defaultTitle'),
        posterUrl: sql<string | null>`(
          SELECT url FROM poster_urls
          WHERE poster_urls.movie_uid = movies.uid
          ORDER BY poster_urls.is_primary DESC
          LIMIT 1
        )`.as('posterUrl'),
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          isNull(movies.deletedAt),
        ),
      );

    if (rows.length === 0) {
      return undefined;
    }

    const groups = new Map<number, AwardYearGroup>();
    for (const row of rows) {
      let group = groups.get(row.ceremonyYear);
      if (!group) {
        group = {
          year: row.ceremonyYear,
          ceremonyNumber: row.ceremonyNumber ?? undefined,
          movies: [],
        };
        groups.set(row.ceremonyYear, group);
      }

      const existing = group.movies.find(movie => movie.uid === row.movieUid);
      if (existing) {
        existing.isWinner = existing.isWinner || row.isWinner === 1;
        continue;
      }

      group.movies.push({
        uid: row.movieUid,
        title: row.jaTitle ?? row.defaultTitle ?? undefined,
        movieYear: row.movieYear ?? undefined,
        posterUrl: row.posterUrl ?? undefined,
        isWinner: row.isWinner === 1,
      });
    }

    const years = [...groups.values()].toSorted((a, b) => b.year - a.year);
    for (const group of years) {
      group.movies.sort((a, b) => Number(b.isWinner) - Number(a.isWinner));
    }

    return {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      grouping: definition.grouping,
      years,
    };
  }

  async getAwardYear(
    slug: string,
    year: number,
  ): Promise<AwardYearDetail | undefined> {
    const definition = awardPageDefinitions.find(entry => entry.slug === slug);
    if (!definition || definition.grouping !== 'year') {
      return undefined;
    }

    const categoryUids = await this.resolveCategoryUids(definition);
    if (categoryUids.length === 0) {
      return undefined;
    }

    const rows = await this.database
      .select({
        movieUid: movies.uid,
        movieYear: movies.year,
        isWinner: nominations.isWinner,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        jaTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
            AND translations.language_code = 'ja'
          LIMIT 1
        )`.as('jaTitle'),
        defaultTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
          ORDER BY translations.is_default DESC
          LIMIT 1
        )`.as('defaultTitle'),
        posterUrl: sql<string | null>`(
          SELECT url FROM poster_urls
          WHERE poster_urls.movie_uid = movies.uid
          ORDER BY poster_urls.is_primary DESC
          LIMIT 1
        )`.as('posterUrl'),
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          eq(awardCeremonies.year, year),
          isNull(movies.deletedAt),
        ),
      );

    if (rows.length === 0) {
      return undefined;
    }

    const movieEntries: AwardMovieEntry[] = [];
    for (const row of rows) {
      const existing = movieEntries.find(movie => movie.uid === row.movieUid);
      if (existing) {
        existing.isWinner = existing.isWinner || row.isWinner === 1;
        continue;
      }

      movieEntries.push({
        uid: row.movieUid,
        title: row.jaTitle ?? row.defaultTitle ?? undefined,
        movieYear: row.movieYear ?? undefined,
        posterUrl: row.posterUrl ?? undefined,
        isWinner: row.isWinner === 1,
      });
    }

    movieEntries.sort((a, b) => Number(b.isWinner) - Number(a.isWinner));

    const yearRows = await this.database
      .selectDistinct({year: awardCeremonies.year})
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          isNull(movies.deletedAt),
        ),
      );

    const years = yearRows.map(row => row.year).toSorted((a, b) => a - b);
    const index = years.indexOf(year);

    return {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      year,
      ceremonyNumber: rows[0].ceremonyNumber ?? undefined,
      movies: movieEntries,
      previousYear: index > 0 ? years[index - 1] : undefined,
      nextYear: index < years.length - 1 ? years[index + 1] : undefined,
    };
  }

  async listAwards(): Promise<AwardSummary[]> {
    const summaries: AwardSummary[] = [];

    for (const definition of awardPageDefinitions) {
      const categoryUids = await this.resolveCategoryUids(definition);
      if (categoryUids.length === 0) {
        continue;
      }

      const [aggregate] = await this.database
        .select({
          movieCount: sql<number>`COUNT(DISTINCT ${nominations.movieUid})`,
          firstYear: sql<number | null>`MIN(${awardCeremonies.year})`,
          lastYear: sql<number | null>`MAX(${awardCeremonies.year})`,
        })
        .from(nominations)
        .innerJoin(
          awardCeremonies,
          eq(nominations.ceremonyUid, awardCeremonies.uid),
        )
        .innerJoin(movies, eq(nominations.movieUid, movies.uid))
        .where(
          and(
            inArray(nominations.categoryUid, categoryUids),
            isNull(movies.deletedAt),
          ),
        );

      if (
        !aggregate ||
        aggregate.movieCount === 0 ||
        aggregate.firstYear === null ||
        aggregate.lastYear === null
      ) {
        continue;
      }

      summaries.push({
        slug: definition.slug,
        name: definition.name,
        organization: definition.organization,
        description: definition.description,
        grouping: definition.grouping,
        movieCount: aggregate.movieCount,
        firstYear: aggregate.firstYear,
        lastYear: aggregate.lastYear,
      });
    }

    return summaries;
  }

  private async resolveCategoryUids(
    definition: AwardPageDefinition,
  ): Promise<string[]> {
    const rows = await this.database
      .select({uid: awardCategories.uid})
      .from(awardCategories)
      .innerJoin(
        awardOrganizations,
        eq(awardCategories.organizationUid, awardOrganizations.uid),
      )
      .where(
        and(
          eq(awardOrganizations.name, definition.organizationName),
          inArray(awardCategories.name, definition.categoryNames),
        ),
      );
    return rows.map(row => row.uid);
  }
}
