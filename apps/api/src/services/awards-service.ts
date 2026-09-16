import {and, eq, inArray, isNull, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import type {
  AwardDetail,
  AwardMovieEntry,
  AwardSummary,
  AwardYearDetail,
  AwardYearGroup,
  PersonAwardDetail,
  PersonAwardYearGroup,
} from '../types/services';
import {BaseService} from './base-service';
import {personLocalizedName} from './person-name';
import {
  awardPageDefinitions,
  personAwardDefinitions,
  type AwardPageDefinition,
  type PersonAwardDefinition,
} from './award-definitions';
import {
  compareAwardMovies,
  compareCodePoints,
  compareNominees,
  flattenListAward,
} from './award-page-ordering';

type CategorySelector = {
  organizationName: string;
  categoryNames: string[];
};

function movieTitleColumns() {
  return {
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
  };
}

function posterUrlColumn() {
  return sql<string | null>`(
      SELECT url FROM poster_urls
      WHERE poster_urls.movie_uid = movies.uid
      ORDER BY poster_urls.is_primary DESC
      LIMIT 1
    )`.as('posterUrl');
}

type AwardMovieRow = {
  movieUid: string;
  movieYear: number | null;
  isWinner: number;
  specialMention: string | null;
  jaTitle: string | null;
  defaultTitle: string | null;
  posterUrl: string | null;
};

function toAwardMovieEntry(row: AwardMovieRow): AwardMovieEntry {
  return {
    uid: row.movieUid,
    title: row.jaTitle ?? row.defaultTitle ?? undefined,
    movieYear: row.movieYear ?? undefined,
    posterUrl: row.posterUrl ?? undefined,
    isWinner: row.isWinner === 1,
    specialMention: row.specialMention ?? undefined,
  };
}

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
        specialMention: nominations.specialMention,
        ceremonyYear: awardCeremonies.year,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        ...movieTitleColumns(),
        posterUrl: posterUrlColumn(),
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
          filmCount: 0,
          movies: [],
        };
        groups.set(row.ceremonyYear, group);
      }

      const existing = group.movies.find(movie => movie.uid === row.movieUid);
      if (existing) {
        existing.isWinner ||= row.isWinner === 1;
        continue;
      }

      group.movies.push(toAwardMovieEntry(row));
    }

    const years = groups
      .values()
      .toArray()
      .toSorted((a, b) => b.year - a.year);
    for (const group of years) {
      group.filmCount = group.movies.length;
      group.movies.sort(compareAwardMovies);
    }

    const base = {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      grouping: definition.grouping,
      ...(definition.subAward && {subAward: true}),
    };

    if (definition.grouping === 'year') {
      return {
        ...base,
        years: years.map(group => ({
          ...group,
          movies: group.movies.filter(movie => movie.isWinner),
        })),
      };
    }

    return {...base, years: flattenListAward(years)};
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
        specialMention: nominations.specialMention,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        ...movieTitleColumns(),
        posterUrl: posterUrlColumn(),
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
        existing.isWinner ||= row.isWinner === 1;
        continue;
      }

      movieEntries.push(toAwardMovieEntry(row));
    }

    movieEntries.sort(compareAwardMovies);

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
      // eslint-disable-next-line unicorn/no-useless-undefined -- 三項の分岐として省略できない
      previousYear: index > 0 ? years[index - 1] : undefined,
      nextYear: index < years.length - 1 ? years[index + 1] : undefined,
    };
  }

  async listAwards(): Promise<AwardSummary[]> {
    const summaries: AwardSummary[] = [];

    for (const definition of awardPageDefinitions) {
      const summary = await this.summarizeAward(
        definition,
        definition.grouping,
      );
      if (summary) {
        summaries.push(summary);
      }
    }

    for (const definition of personAwardDefinitions) {
      const summary = await this.summarizeAward(definition, 'person');
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries;
  }

  async getPersonAwardBySlug(
    slug: string,
  ): Promise<PersonAwardDetail | undefined> {
    const definition = personAwardDefinitions.find(
      entry => entry.slug === slug,
    );
    if (!definition) {
      return undefined;
    }

    const categoryUids = await this.resolveCategoryUids(definition);
    if (categoryUids.length === 0) {
      return undefined;
    }

    const rows = await this.database
      .select({
        personUid: people.uid,
        personName: people.name,
        profilePath: people.profilePath,
        jaName: personLocalizedName('ja').as('jaName'),
        isWinner: nominations.isWinner,
        ceremonyYear: awardCeremonies.year,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        movieUid: movies.uid,
        movieYear: movies.year,
        ...movieTitleColumns(),
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .innerJoin(people, eq(nominations.personUid, people.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          isNull(movies.deletedAt),
        ),
      );

    if (rows.length === 0) {
      return undefined;
    }

    const groups = new Map<number, PersonAwardYearGroup>();
    for (const row of rows) {
      let group = groups.get(row.ceremonyYear);
      if (!group) {
        group = {
          year: row.ceremonyYear,
          ceremonyNumber: row.ceremonyNumber ?? undefined,
          nominees: [],
        };
        groups.set(row.ceremonyYear, group);
      }

      let nominee = group.nominees.find(entry => entry.uid === row.personUid);
      if (!nominee) {
        nominee = {
          uid: row.personUid,
          name: row.jaName ?? row.personName,
          originalName: row.personName,
          profilePath: row.profilePath ?? undefined,
          isWinner: false,
          movies: [],
        };
        group.nominees.push(nominee);
      }

      nominee.isWinner ||= row.isWinner === 1;
      if (nominee.movies.every(movie => movie.uid !== row.movieUid)) {
        nominee.movies.push({
          uid: row.movieUid,
          title: row.jaTitle ?? row.defaultTitle ?? undefined,
          movieYear: row.movieYear ?? undefined,
        });
      }
    }

    const years = groups
      .values()
      .toArray()
      .toSorted((a, b) => b.year - a.year);
    for (const group of years) {
      group.nominees.sort(compareNominees);
      for (const nominee of group.nominees) {
        nominee.movies.sort((a, b) =>
          compareCodePoints(a.title ?? '', b.title ?? ''),
        );
      }
    }

    return {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      grouping: 'person',
      years,
    };
  }

  private async summarizeAward(
    definition: AwardPageDefinition | PersonAwardDefinition,
    grouping: AwardSummary['grouping'],
  ): Promise<AwardSummary | undefined> {
    const categoryUids = await this.resolveCategoryUids(definition);
    if (categoryUids.length === 0) {
      return undefined;
    }

    const [aggregate] = await this.database
      .select({
        movieCount: sql<number>`COUNT(DISTINCT ${nominations.movieUid})`,
        personCount: sql<number>`COUNT(DISTINCT ${nominations.personUid})`,
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
      return undefined;
    }

    return {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      grouping,
      movieCount: aggregate.movieCount,
      ...(grouping === 'person' && {personCount: aggregate.personCount}),
      ...('subAward' in definition && definition.subAward && {subAward: true}),
      firstYear: aggregate.firstYear,
      lastYear: aggregate.lastYear,
    };
  }

  private async resolveCategoryUids(
    definition: CategorySelector,
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
