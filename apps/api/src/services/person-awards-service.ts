import {and, eq, inArray, isNull} from '@shine/database';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import type {PersonAwardDetail, PersonAwardYearGroup} from '../types/awards';
import {personAwardDefinitions} from './award-definitions';
import {compareCodePoints, compareNominees} from './award-page-ordering';
import {movieTitleColumns, resolveCategoryUids} from './award-category-queries';
import {BaseService} from './base-service';
import {personLocalizedName} from './person-name';

export class PersonAwardsService extends BaseService {
  async getPersonAwardBySlug(
    slug: string,
  ): Promise<PersonAwardDetail | undefined> {
    const definition = personAwardDefinitions.find(
      entry => entry.slug === slug,
    );
    if (!definition) {
      return undefined;
    }

    const categoryUids = await resolveCategoryUids(this.database, definition);
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
}
