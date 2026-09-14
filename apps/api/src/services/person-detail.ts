import {and, eq, inArray, isNull, sql, type getDatabase} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import type {PersonDetail} from '@shine/types';
import {
  findAwardPageDefinition,
  findPersonAwardDefinition,
  japaneseAwardNames,
} from './awards-service';
import {awardPageDefinitions} from './award-definitions';
import {joinAwardContext, localizedMovieTitle} from './people-query';
import {personLocalizedName} from './person-name';

type Database = ReturnType<typeof getDatabase>;

type Credit = PersonDetail['credits'][number];

export async function loadPersonDetail(
  database: Database,
  personUid: string,
  locale: string,
): Promise<PersonDetail | undefined> {
  const personQuery = database
    .select({
      uid: people.uid,
      name: people.name,
      profilePath: people.profilePath,
      localizedName: personLocalizedName(locale),
    })
    .from(people)
    .where(eq(people.uid, personUid))
    .limit(1);

  const creditsQuery = database
    .select({
      movieUid: movies.uid,
      year: movies.year,
      job: movieCredits.job,
      character: movieCredits.character,
      title: localizedMovieTitle(locale),
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
    .where(and(eq(movieCredits.personUid, personUid), isNull(movies.deletedAt)))
    .orderBy(sql`${movies.year} DESC`);

  const [personRows, creditRows] = await Promise.all([
    personQuery,
    creditsQuery,
  ]);

  const person = personRows[0];
  if (!person) {
    return undefined;
  }

  const byMovie = new Map<string, Credit>();
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
    attachCreditAwards(database, byMovie),
    attachPersonAwards(database, byMovie, personUid),
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

async function attachPersonAwards(
  database: Database,
  byMovie: Map<string, Credit>,
  personUid: string,
): Promise<void> {
  const rows = await joinAwardContext(
    database
      .select({
        movieUid: nominations.movieUid,
        isWinner: nominations.isWinner,
        organizationName: awardOrganizations.name,
        categoryName: awardCategories.name,
        ceremonyYear: awardCeremonies.year,
      })
      .from(nominations)
      .$dynamic(),
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

async function attachCreditAwards(
  database: Database,
  byMovie: Map<string, Credit>,
): Promise<Set<string>> {
  const movieUids = byMovie.keys().toArray();
  const presentSlugs = new Set<string>();
  if (movieUids.length === 0) {
    return presentSlugs;
  }

  const rows = await joinAwardContext(
    database
      .select({
        movieUid: nominations.movieUid,
        isWinner: nominations.isWinner,
        organizationName: awardOrganizations.name,
        categoryName: awardCategories.name,
      })
      .from(nominations)
      .$dynamic(),
  ).where(inArray(nominations.movieUid, movieUids));

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
