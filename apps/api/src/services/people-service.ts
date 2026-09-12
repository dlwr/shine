import {
  type Environment,
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {
  findAwardPageDefinition,
  findPersonAwardDefinition,
  japaneseAwardNames,
  personAwardNominations,
} from './awards-service';
import {awardPageDefinitions} from './award-definitions';
import {BaseService} from './base-service';
import {EdgeCache} from '../utils/cache';
import type {
  PeopleListResult,
  PersonDetail,
  ProminentPeople,
  ProminentPerson,
  ProminentPersonMovie,
} from '@shine/types';
import {personLocalizedName} from './person-name';

const PROMINENT_LIMIT = 24;
const SEARCH_LIMIT = 8;
const TOP_MOVIE_LIMIT = 3;

const awardOccasion = sql`${nominations.ceremonyUid} || ':' || ${nominations.categoryUid}`;

const movieCount = sql<number>`COUNT(DISTINCT ${movieCredits.movieUid})`;

const ELIGIBLE_RANKING_CACHE_PREFIX = 'people:eligible:v2';
const ELIGIBLE_RANKING_CACHE_TTL = 604_800;
const ELIGIBLE_RANKING_CHUNK_SIZE = 500;

type RankedPerson = {uid: string; movieCount: number};

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
    const {totalCount, rows: pageRows} = await this.rankingSlice(
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
    const personQuery = this.database
      .select({
        uid: people.uid,
        name: people.name,
        profilePath: people.profilePath,
        localizedName: personLocalizedName(locale),
      })
      .from(people)
      .where(eq(people.uid, personUid))
      .limit(1);

    const creditsQuery = this.database
      .select({
        movieUid: movies.uid,
        year: movies.year,
        job: movieCredits.job,
        character: movieCredits.character,
        title: sql<string | null>`
					(
					  SELECT content
					  FROM translations
					  WHERE translations.resource_uid = movies.uid
					    AND translations.resource_type = 'movie_title'
					  ORDER BY (translations.language_code = ${locale}) DESC,
					    translations.is_default DESC,
					    (translations.language_code = 'en') DESC
					  LIMIT 1
					)
				`.as('title'),
        posterUrl: sql<string | null>`
					(
					  SELECT url
					  FROM poster_urls
					  WHERE poster_urls.movie_uid = movies.uid
					  ORDER BY poster_urls.is_primary DESC
					  LIMIT 1
					)
				`.as('poster_url'),
      })
      .from(movieCredits)
      .innerJoin(movies, eq(movies.uid, movieCredits.movieUid))
      .where(
        and(eq(movieCredits.personUid, personUid), isNull(movies.deletedAt)),
      )
      .orderBy(sql`${movies.year} DESC`);

    const [personRows, creditRows] = await Promise.all([
      personQuery,
      creditsQuery,
    ]);

    const person = personRows[0];
    if (!person) {
      return undefined;
    }

    const byMovie = new Map<string, PersonDetail['credits'][number]>();
    for (const row of creditRows) {
      const credit = byMovie.get(row.movieUid) ?? {
        movieUid: row.movieUid,
        title: row.title ?? undefined,
        year: row.year ?? undefined,
        posterUrl: row.posterUrl ?? undefined,
        jobs: [],
        character: undefined,
        awards: [],
        personAwards: [],
      };

      if (row.job && !credit.jobs.includes(row.job)) {
        credit.jobs.push(row.job);
      }

      credit.character ??= row.character ?? undefined;
      byMovie.set(row.movieUid, credit);
    }

    const [legendSlugs] = await Promise.all([
      this.attachCreditAwards(byMovie),
      this.attachPersonAwards(byMovie, personUid),
    ]);

    return {
      uid: person.uid,
      name: person.localizedName ?? person.name,
      originalName: person.name,
      profilePath: person.profilePath ?? undefined,
      credits: byMovie.values().toArray(),
      awards: awardPageDefinitions
        .filter(definition => legendSlugs.has(definition.slug))
        .map(definition => ({
          slug: definition.slug,
          shortLabel: definition.shortLabel,
          name: definition.name,
          organization: definition.organization,
          grouping: definition.grouping,
        })),
    };
  }

  async getProminentPeople({
    locale,
    limit = PROMINENT_LIMIT,
  }: {
    locale: string;
    limit?: number;
  }): Promise<ProminentPeople> {
    const [directors, actors] = await Promise.all([
      this.rankPeople('director', locale, limit),
      this.rankPeople('actor', locale, limit),
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
    const pattern = likePattern(query);
    const awarded = this.database
      .select({
        personUid: sql<string>`${nominations.personUid}`.as(
          'awarded_person_uid',
        ),
        wonCount:
          sql<number>`COUNT(DISTINCT CASE WHEN ${nominations.isWinner} = 1 THEN ${awardOccasion} END)`.as(
            'awarded_won_count',
          ),
        nominatedCount: sql<number>`COUNT(DISTINCT ${awardOccasion})`.as(
          'awarded_nominated_count',
        ),
      })
      .from(nominations)
      .innerJoin(
        movies,
        and(eq(movies.uid, nominations.movieUid), isNull(movies.deletedAt)),
      )
      .innerJoin(
        awardCeremonies,
        eq(awardCeremonies.uid, nominations.ceremonyUid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardOrganizations.uid, awardCeremonies.organizationUid),
      )
      .innerJoin(
        awardCategories,
        eq(awardCategories.uid, nominations.categoryUid),
      )
      .where(and(isNotNull(nominations.personUid), personAwardNominations()))
      .groupBy(nominations.personUid)
      .as('awarded');

    const wonCount = sql<number>`COALESCE(${awarded.wonCount}, 0)`;
    const nominatedCount = sql<number>`COALESCE(${awarded.nominatedCount}, 0)`;
    const creditCount = sql<number>`(
			SELECT COUNT(*)
			FROM movie_credits
			JOIN movies ON movies.uid = movie_credits.movie_uid
			  AND movies.deleted_at IS NULL
			WHERE movie_credits.person_uid = ${people.uid}
		)`;

    const rows = await this.database
      .select({
        uid: people.uid,
        name: people.name,
        profilePath: people.profilePath,
        localizedName: personLocalizedName(locale),
        wonCount: wonCount.as('won_count'),
        nominatedCount: nominatedCount.as('nominated_count'),
      })
      .from(people)
      .leftJoin(awarded, eq(awarded.personUid, people.uid))
      .where(
        or(
          sql`${people.name} LIKE ${pattern} ESCAPE '\\'`,
          sql`EXISTS (
					  SELECT 1
					  FROM translations AS person_names
					  WHERE person_names.resource_uid = ${people.uid}
					    AND person_names.resource_type = 'person_name'
					    AND person_names.content LIKE ${pattern} ESCAPE '\\'
					)`,
        ),
      )
      .orderBy(
        desc(wonCount),
        desc(nominatedCount),
        desc(creditCount),
        people.uid,
      )
      .limit(limit);

    const topMovies = await this.loadTopMovies(
      rows.map(row => row.uid),
      undefined,
      locale,
    );

    return rows.map(row => ({
      uid: row.uid,
      name: row.localizedName ?? row.name,
      originalName: row.name,
      profilePath: row.profilePath ?? undefined,
      wonCount: row.wonCount,
      nominatedCount: row.nominatedCount,
      topMovies: topMovies.get(row.uid) ?? [],
    }));
  }

  private eligiblePeople() {
    const deletedMovies = this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(isNotNull(movies.deletedAt));

    return this.database
      .select({
        personUid: movieCredits.personUid,
        movieCount: movieCount.as('movie_count'),
      })
      .from(movieCredits)
      .where(notInArray(movieCredits.movieUid, deletedMovies))
      .groupBy(movieCredits.personUid)
      .having(
        sql`${movieCount} >= 2 OR SUM(${movieCredits.job} = 'Director') > 0`,
      )
      .as('eligible');
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

  private async rankingSlice(
    start: number,
    end: number,
  ): Promise<{totalCount: number; rows: RankedPerson[]}> {
    const cached = await this.cachedRankingSlice(start, end);
    if (cached) {
      return cached;
    }

    const ranking = await this.computeRanking();
    await this.storeRanking(ranking);
    return {totalCount: ranking.length, rows: ranking.slice(start, end)};
  }

  private async cachedRankingSlice(
    start: number,
    end: number,
  ): Promise<{totalCount: number; rows: RankedPerson[]} | undefined> {
    if (!this.rankingCache) {
      return undefined;
    }

    const count = await this.rankingCache.get(
      `${ELIGIBLE_RANKING_CACHE_PREFIX}:count`,
    );
    if (typeof count?.data !== 'number') {
      return undefined;
    }

    const totalCount = count.data;
    if (start >= totalCount) {
      return {totalCount, rows: []};
    }

    const firstChunk = Math.floor(start / ELIGIBLE_RANKING_CHUNK_SIZE);
    const lastChunk = Math.floor(
      (Math.min(end, totalCount) - 1) / ELIGIBLE_RANKING_CHUNK_SIZE,
    );
    const chunks = await Promise.all(
      Array.from({length: lastChunk - firstChunk + 1}, (_, offset) =>
        this.rankingCache?.get(
          `${ELIGIBLE_RANKING_CACHE_PREFIX}:chunk:${firstChunk + offset}`,
        ),
      ),
    );
    if (chunks.some(chunk => !Array.isArray(chunk?.data))) {
      return undefined;
    }

    const rows = chunks.flatMap(chunk => chunk?.data as RankedPerson[]);
    const offset = firstChunk * ELIGIBLE_RANKING_CHUNK_SIZE;
    return {totalCount, rows: rows.slice(start - offset, end - offset)};
  }

  private async computeRanking(): Promise<RankedPerson[]> {
    const eligible = this.eligiblePeople();
    return this.database
      .select({uid: eligible.personUid, movieCount: eligible.movieCount})
      .from(eligible)
      .orderBy(sql`${eligible.movieCount} DESC`, eligible.personUid);
  }

  private async storeRanking(ranking: RankedPerson[]): Promise<void> {
    if (!this.rankingCache) {
      return;
    }

    const chunkCount = Math.ceil(ranking.length / ELIGIBLE_RANKING_CHUNK_SIZE);
    await Promise.all([
      this.rankingCache.set(
        `${ELIGIBLE_RANKING_CACHE_PREFIX}:count`,
        ranking.length,
        ELIGIBLE_RANKING_CACHE_TTL,
      ),
      ...Array.from({length: chunkCount}, (_, index) =>
        this.rankingCache?.set(
          `${ELIGIBLE_RANKING_CACHE_PREFIX}:chunk:${index}`,
          ranking.slice(
            index * ELIGIBLE_RANKING_CHUNK_SIZE,
            (index + 1) * ELIGIBLE_RANKING_CHUNK_SIZE,
          ),
          ELIGIBLE_RANKING_CACHE_TTL,
        ),
      ),
    ]);
  }

  private async attachPersonAwards(
    byMovie: Map<string, PersonDetail['credits'][number]>,
    personUid: string,
  ): Promise<void> {
    const rows = await this.database
      .select({
        movieUid: nominations.movieUid,
        isWinner: nominations.isWinner,
        organizationName: awardOrganizations.name,
        categoryName: awardCategories.name,
        ceremonyYear: awardCeremonies.year,
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(awardCeremonies.uid, nominations.ceremonyUid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardOrganizations.uid, awardCeremonies.organizationUid),
      )
      .innerJoin(
        awardCategories,
        eq(awardCategories.uid, nominations.categoryUid),
      )
      .where(eq(nominations.personUid, personUid))
      .orderBy(awardCategories.name);

    for (const row of rows) {
      const names = japaneseAwardNames(row.organizationName, row.categoryName);
      byMovie.get(row.movieUid)?.personAwards.push({
        slug: findPersonAwardDefinition(row.organizationName, row.categoryName)
          ?.slug,
        organization: names.organization ?? row.organizationName,
        category: names.category ?? row.categoryName,
        year: row.ceremonyYear,
        isWinner: row.isWinner === 1,
      });
    }
  }

  private async attachCreditAwards(
    byMovie: Map<string, PersonDetail['credits'][number]>,
  ): Promise<Set<string>> {
    const movieUids = byMovie.keys().toArray();
    const presentSlugs = new Set<string>();
    if (movieUids.length === 0) {
      return presentSlugs;
    }

    const rows = await this.database
      .select({
        movieUid: nominations.movieUid,
        isWinner: nominations.isWinner,
        organizationName: awardOrganizations.name,
        categoryName: awardCategories.name,
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(awardCeremonies.uid, nominations.ceremonyUid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardOrganizations.uid, awardCeremonies.organizationUid),
      )
      .innerJoin(
        awardCategories,
        eq(awardCategories.uid, nominations.categoryUid),
      )
      .where(inArray(nominations.movieUid, movieUids));

    for (const row of rows) {
      const credit = byMovie.get(row.movieUid);
      const slug = findAwardPageDefinition(
        row.organizationName,
        row.categoryName,
      )?.slug;
      if (!credit || !slug) {
        continue;
      }

      presentSlugs.add(slug);
      const isWinner = row.isWinner === 1;
      const award = credit.awards.find(entry => entry.slug === slug);
      if (award) {
        award.isWinner ||= isWinner;
      } else {
        credit.awards.push({slug, isWinner});
      }
    }

    const slugOrder = new Map(
      awardPageDefinitions.map((definition, index) => [definition.slug, index]),
    );
    for (const credit of byMovie.values()) {
      credit.awards.sort(
        (a, b) => (slugOrder.get(a.slug) ?? 0) - (slugOrder.get(b.slug) ?? 0),
      );
    }

    return presentSlugs;
  }

  private async rankPeople(
    role: 'director' | 'actor',
    locale: string,
    limit: number,
  ): Promise<ProminentPerson[]> {
    const wonCount = sql<number>`COUNT(DISTINCT CASE WHEN ${nominations.isWinner} = 1 THEN ${awardOccasion} END)`;
    const nominatedCount = sql<number>`COUNT(DISTINCT ${awardOccasion})`;

    const rows = await this.database
      .select({
        uid: people.uid,
        name: people.name,
        profilePath: people.profilePath,
        localizedName: personLocalizedName(locale),
        wonCount: wonCount.as('won_count'),
        nominatedCount: nominatedCount.as('nominated_count'),
      })
      .from(people)
      .innerJoin(nominations, eq(nominations.personUid, people.uid))
      .innerJoin(
        movies,
        and(eq(movies.uid, nominations.movieUid), isNull(movies.deletedAt)),
      )
      .innerJoin(
        awardCeremonies,
        eq(awardCeremonies.uid, nominations.ceremonyUid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardOrganizations.uid, awardCeremonies.organizationUid),
      )
      .innerJoin(
        awardCategories,
        eq(awardCategories.uid, nominations.categoryUid),
      )
      .where(personAwardNominations(role))
      .groupBy(people.uid)
      .orderBy(desc(wonCount), desc(nominatedCount), people.uid)
      .limit(limit);

    const topMovies = await this.loadTopMovies(
      rows.map(row => row.uid),
      role,
      locale,
    );

    return rows.map(row => ({
      uid: row.uid,
      name: row.localizedName ?? row.name,
      originalName: row.name,
      profilePath: row.profilePath ?? undefined,
      wonCount: row.wonCount,
      nominatedCount: row.nominatedCount,
      topMovies: topMovies.get(row.uid) ?? [],
    }));
  }

  private async loadTopMovies(
    personUids: string[],
    role: 'director' | 'actor' | undefined,
    locale: string,
  ): Promise<Map<string, ProminentPersonMovie[]>> {
    const byPerson = new Map<string, ProminentPersonMovie[]>();
    if (personUids.length === 0) {
      return byPerson;
    }

    const rows = await this.database
      .select({
        personUid: sql<string>`${nominations.personUid}`.as('person_uid'),
        uid: movies.uid,
        year: movies.year,
        title: sql<string | null>`
					(
					  SELECT content
					  FROM translations
					  WHERE translations.resource_uid = movies.uid
					    AND translations.resource_type = 'movie_title'
					  ORDER BY (translations.language_code = ${locale}) DESC,
					    translations.is_default DESC,
					    (translations.language_code = 'en') DESC
					  LIMIT 1
					)
				`.as('title'),
      })
      .from(nominations)
      .innerJoin(
        movies,
        and(eq(movies.uid, nominations.movieUid), isNull(movies.deletedAt)),
      )
      .innerJoin(
        awardCeremonies,
        eq(awardCeremonies.uid, nominations.ceremonyUid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardOrganizations.uid, awardCeremonies.organizationUid),
      )
      .innerJoin(
        awardCategories,
        eq(awardCategories.uid, nominations.categoryUid),
      )
      .where(
        and(
          inArray(nominations.personUid, personUids),
          eq(nominations.isWinner, 1),
          personAwardNominations(role),
        ),
      )
      .orderBy(desc(movies.year));

    for (const row of rows) {
      const movieList = byPerson.get(row.personUid) ?? [];
      if (
        movieList.length >= TOP_MOVIE_LIMIT ||
        movieList.some(movie => movie.uid === row.uid)
      ) {
        continue;
      }

      movieList.push({
        uid: row.uid,
        title: row.title ?? undefined,
        year: row.year ?? undefined,
      });
      byPerson.set(row.personUid, movieList);
    }

    return byPerson;
  }
}

function likePattern(query: string): string {
  return `%${query.replaceAll(/[\\%_]/g, String.raw`\$&`)}%`;
}
