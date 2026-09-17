import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  sql,
  type getDatabase,
} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import type {ProminentPerson, ProminentPersonMovie} from '../types/services';
import {personAwardNominations} from './award-definition-lookup';
import {personAwardDefinitions} from './award-definitions';
import {joinAwardContext, localizedMovieTitle} from './people-query';
import {personLocalizedName} from './person-name';
import {personUidsMatchingName} from './search-terms';

type Database = ReturnType<typeof getDatabase>;

type Role = 'director' | 'actor';

const TOP_MOVIE_LIMIT = 3;

const awardOccasion = sql`${nominations.ceremonyUid} || ':' || ${nominations.categoryUid}`;

export async function rankProminentPeople(
  database: Database,
  role: Role,
  locale: string,
  limit: number,
): Promise<ProminentPerson[]> {
  const wonCount = sql<number>`COUNT(DISTINCT CASE WHEN ${nominations.isWinner} = 1 THEN ${awardOccasion} END)`;
  const nominatedCount = sql<number>`COUNT(DISTINCT ${awardOccasion})`;

  const rows = await joinAwardContext(
    database
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
      .$dynamic(),
  )
    .where(personAwardNominations(role))
    .groupBy(people.uid)
    .orderBy(desc(wonCount), desc(nominatedCount), people.uid)
    .limit(limit);

  const topMovies = await loadTopMovies(
    database,
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

/** 部門の条件を OR で連ねると Turso の式の深さ上限 100 を超えるので、平らな IN にする */
function awardedCountOf(aggregate: ReturnType<typeof sql>) {
  const definitions = sql.join(
    personAwardDefinitions.flatMap(definition =>
      definition.categoryNames.map(
        name => sql`${`${definition.organizationName}\u{1F}${name}`}`,
      ),
    ),
    sql`, `,
  );

  return sql<number>`(
			SELECT ${aggregate}
			FROM nominations
			JOIN movies ON movies.uid = nominations.movie_uid
			  AND movies.deleted_at IS NULL
			JOIN award_ceremonies ON award_ceremonies.uid = nominations.ceremony_uid
			JOIN award_organizations ON award_organizations.uid = award_ceremonies.organization_uid
			JOIN award_categories ON award_categories.uid = nominations.category_uid
			WHERE nominations.person_uid = people.uid
			  AND award_organizations.name || char(31) || award_categories.name IN (${definitions})
		)`;
}

export async function searchPeopleByName(
  database: Database,
  query: string,
  locale: string,
  limit: number,
): Promise<ProminentPerson[]> {
  const wonCount = awardedCountOf(
    sql`COUNT(DISTINCT CASE WHEN nominations.is_winner = 1 THEN nominations.ceremony_uid || ':' || nominations.category_uid END)`,
  );
  const nominatedCount = awardedCountOf(
    sql`COUNT(DISTINCT nominations.ceremony_uid || ':' || nominations.category_uid)`,
  );
  const creditCount = sql<number>`(
			SELECT COUNT(*)
			FROM movie_credits
			JOIN movies ON movies.uid = movie_credits.movie_uid
			  AND movies.deleted_at IS NULL
			WHERE movie_credits.person_uid = people.uid
		)`;

  const rows = await database
    .select({
      uid: people.uid,
      name: people.name,
      profilePath: people.profilePath,
      localizedName: personLocalizedName(locale),
      wonCount: wonCount.as('won_count'),
      nominatedCount: nominatedCount.as('nominated_count'),
    })
    .from(people)
    .where(sql`${people.uid} IN (${personUidsMatchingName(query)})`)
    .orderBy(
      sql`won_count DESC`,
      sql`nominated_count DESC`,
      desc(creditCount),
      people.uid,
    )
    .limit(limit);

  const topMovies = await loadTopMovies(
    database,
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

async function loadTopMovies(
  database: Database,
  personUids: string[],
  role: Role | undefined,
  locale: string,
): Promise<Map<string, ProminentPersonMovie[]>> {
  const byPerson = new Map<string, ProminentPersonMovie[]>();
  if (personUids.length === 0) {
    return byPerson;
  }

  const rows = await joinAwardContext(
    database
      .select({
        personUid: sql<string>`${nominations.personUid}`.as('person_uid'),
        uid: movies.uid,
        year: movies.year,
        title: localizedMovieTitle(locale),
      })
      .from(nominations)
      .innerJoin(
        movies,
        and(eq(movies.uid, nominations.movieUid), isNull(movies.deletedAt)),
      )
      .$dynamic(),
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
