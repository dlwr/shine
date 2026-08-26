import {and, desc, eq, inArray, isNull, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {
  awardPageDefinitions,
  findAwardPageDefinition,
  findPersonAwardDefinition,
  japaneseAwardNames,
  personAwardNominations,
} from './awards-service';
import {BaseService} from './base-service';
import type {
  PeopleListResult,
  PersonDetail,
  ProminentPeople,
  ProminentPerson,
  ProminentPersonMovie,
} from '@shine/types';

const PROMINENT_LIMIT = 24;
const TOP_MOVIE_LIMIT = 3;

const awardOccasion = sql`${nominations.ceremonyUid} || ':' || ${nominations.categoryUid}`;

const movieCount = sql<number>`COUNT(DISTINCT ${movieCredits.movieUid})`;

export class PeopleService extends BaseService {
  async listPeople({
    page,
    limit,
  }: {
    page: number;
    limit: number;
  }): Promise<PeopleListResult> {
    const eligible = this.database
      .select({
        uid: people.uid,
        name: people.name,
        movieCount: movieCount.as('movie_count'),
      })
      .from(people)
      .innerJoin(movieCredits, eq(movieCredits.personUid, people.uid))
      .innerJoin(
        movies,
        and(eq(movies.uid, movieCredits.movieUid), isNull(movies.deletedAt)),
      )
      .groupBy(people.uid)
      .having(
        sql`${movieCount} >= 2 OR SUM(${movieCredits.job} = 'Director') > 0`,
      )
      .as('eligible');

    const [countRow] = await this.database
      .select({totalCount: sql<number>`COUNT(*)`})
      .from(eligible);
    const totalCount = countRow?.totalCount ?? 0;

    const rows = await this.database
      .select()
      .from(eligible)
      .orderBy(sql`${eligible.movieCount} DESC`, eligible.uid)
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      people: rows,
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
    const personRows = await this.database
      .select({
        uid: people.uid,
        name: people.name,
        profilePath: people.profilePath,
        localizedName: translations.content,
      })
      .from(people)
      .leftJoin(
        translations,
        and(
          eq(translations.resourceUid, people.uid),
          eq(translations.resourceType, 'person_name'),
          eq(translations.languageCode, locale),
        ),
      )
      .where(eq(people.uid, personUid))
      .limit(1);

    const person = personRows[0];
    if (!person) {
      return undefined;
    }

    const creditRows = await this.database
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

    const legendSlugs = await this.attachCreditAwards(byMovie);
    await this.attachPersonAwards(byMovie, personUid);

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
        localizedName: translations.content,
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
      .leftJoin(
        translations,
        and(
          eq(translations.resourceUid, people.uid),
          eq(translations.resourceType, 'person_name'),
          eq(translations.languageCode, locale),
        ),
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
    role: 'director' | 'actor',
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
