import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type getDatabase,
} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import type {ProminentPerson, ProminentPersonMovie} from '@shine/types';
import {personAwardNominations} from './awards-service';
import {joinAwardContext, localizedMovieTitle} from './people-query';
import {personLocalizedName} from './person-name';

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

export async function searchPeopleByName(
  database: Database,
  query: string,
  locale: string,
  limit: number,
): Promise<ProminentPerson[]> {
  const pattern = likePattern(query);
  const awarded = joinAwardContext(
    database
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
      .$dynamic(),
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

function likePattern(query: string): string {
  return `%${query.replaceAll(/[\\%_]/g, String.raw`\$&`)}%`;
}
