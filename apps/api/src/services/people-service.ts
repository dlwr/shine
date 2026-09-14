import {inArray, type Environment} from '@shine/database';
import {people} from '@shine/database/schema/people';
import type {
  PeopleListResult,
  PersonDetail,
  ProminentPeople,
  ProminentPerson,
} from '@shine/types';
import {BaseService} from './base-service';
import {eligibleRankingSlice} from './people-ranking';
import {loadPersonDetail} from './person-detail';
import {rankProminentPeople, searchPeopleByName} from './prominent-people';
import {EdgeCache} from '../utils/cache';

const PROMINENT_LIMIT = 24;
const SEARCH_LIMIT = 8;

export class PeopleService extends BaseService {
  private readonly rankingCache?: EdgeCache;

  constructor(environment: Environment) {
    super(environment);
    this.rankingCache = environment.CACHE_KV
      ? new EdgeCache(undefined, environment.CACHE_KV)
      : undefined;
  }

  async listPeople({
    page,
    limit,
  }: {
    page: number;
    limit: number;
  }): Promise<PeopleListResult> {
    const start = (page - 1) * limit;
    const {totalCount, rows: pageRows} = await eligibleRankingSlice(
      this.database,
      this.rankingCache,
      start,
      start + limit,
    );
    const names = await this.namesOf(pageRows.map(row => row.uid));

    return {
      people: pageRows.flatMap(row => {
        const name = names.get(row.uid);
        return name === undefined
          ? []
          : [{uid: row.uid, name, movieCount: row.movieCount}];
      }),
      pagination: {
        page,
        perPage: limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  async getPerson(
    personUid: string,
    locale: string,
  ): Promise<PersonDetail | undefined> {
    return loadPersonDetail(this.database, personUid, locale);
  }

  async getProminentPeople({
    locale,
    limit = PROMINENT_LIMIT,
  }: {
    locale: string;
    limit?: number;
  }): Promise<ProminentPeople> {
    const [directors, actors] = await Promise.all([
      rankProminentPeople(this.database, 'director', locale, limit),
      rankProminentPeople(this.database, 'actor', locale, limit),
    ]);

    return {directors, actors};
  }

  async searchPeople({
    query,
    locale,
    limit = SEARCH_LIMIT,
  }: {
    query: string;
    locale: string;
    limit?: number;
  }): Promise<ProminentPerson[]> {
    return searchPeopleByName(this.database, query, locale, limit);
  }

  private async namesOf(uids: string[]): Promise<Map<string, string>> {
    if (uids.length === 0) {
      return new Map();
    }

    const rows = await this.database
      .select({uid: people.uid, name: people.name})
      .from(people)
      .where(inArray(people.uid, uids));
    return new Map(rows.map(row => [row.uid, row.name]));
  }
}
