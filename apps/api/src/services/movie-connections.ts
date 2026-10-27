import {
  and,
  eq,
  inArray,
  inChunks,
  isNotNull,
  isNull,
  notInArray,
  sql,
  type getDatabase,
} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import type {
  DoubleFeatureConnectionKind,
  DoubleFeatureMovie,
} from '../types/double-feature';
import {
  awardPageNominations,
  findTopAwardPageDefinition,
} from './award-definition-lookup';
import {localizedPosterUrl} from './localized-poster-url';
import {movieTitleColumns} from './movie-title-columns';
import {personLocalizedName} from './person-name';

type Database = ReturnType<typeof getDatabase>;

const MAX_CANDIDATES_PER_QUERY = 200;

type Anchor = {anchorUid: string; name: string};

function addAnchor(
  anchors: Map<string, Anchor[]>,
  key: string,
  anchor: Anchor,
): void {
  const list = anchors.get(key);
  if (list) {
    list.push(anchor);
  } else {
    anchors.set(key, [anchor]);
  }
}

export type MovieConnection = {
  kind: DoubleFeatureConnectionKind;
  anchorUid: string;
  movieUid: string;
  name: string;
};

export async function findMovieConnections(
  database: Database,
  anchorUids: string[],
): Promise<MovieConnection[]> {
  if (anchorUids.length === 0) {
    return [];
  }

  const [personConnections, categoryConnections] = await Promise.all([
    findPersonConnections(database, anchorUids),
    findCategoryConnections(database, anchorUids),
  ]);
  return [...personConnections, ...categoryConnections];
}

async function findPersonConnections(
  database: Database,
  anchorUids: string[],
): Promise<MovieConnection[]> {
  const anchorCredits = await database
    .select({
      anchorUid: movieCredits.movieUid,
      personUid: movieCredits.personUid,
      job: movieCredits.job,
      department: movieCredits.department,
      name: people.name,
      localizedName: personLocalizedName('ja'),
    })
    .from(movieCredits)
    .innerJoin(people, eq(people.uid, movieCredits.personUid))
    .where(inArray(movieCredits.movieUid, anchorUids));
  const directors = new Map<string, Anchor[]>();
  const cast = new Map<string, Anchor[]>();
  for (const credit of anchorCredits) {
    const target =
      credit.job === 'Director'
        ? directors
        : credit.department === 'Acting'
          ? cast
          : undefined;
    if (target) {
      addAnchor(target, credit.personUid, {
        anchorUid: credit.anchorUid,
        name: credit.localizedName ?? credit.name,
      });
    }
  }

  const personUids = [...new Set([...directors.keys(), ...cast.keys()])];
  if (personUids.length === 0) {
    return [];
  }

  const partnerCredits = await inChunks(personUids, chunk =>
    database
      .select({
        personUid: movieCredits.personUid,
        movieUid: movieCredits.movieUid,
        job: movieCredits.job,
        department: movieCredits.department,
      })
      .from(movieCredits)
      .innerJoin(movies, eq(movies.uid, movieCredits.movieUid))
      .where(
        and(
          inArray(movieCredits.personUid, chunk),
          notInArray(movieCredits.movieUid, anchorUids),
          isNull(movies.deletedAt),
        ),
      )
      .orderBy(movieCredits.movieUid, movieCredits.personUid)
      .limit(MAX_CANDIDATES_PER_QUERY),
  );

  const connections: MovieConnection[] = [];
  for (const credit of partnerCredits) {
    const kind =
      directors.has(credit.personUid) && credit.job === 'Director'
        ? 'director'
        : cast.has(credit.personUid) && credit.department === 'Acting'
          ? 'cast'
          : undefined;
    if (!kind) {
      continue;
    }

    const anchors = (kind === 'director' ? directors : cast).get(
      credit.personUid,
    )!;
    for (const anchor of anchors) {
      connections.push({kind, movieUid: credit.movieUid, ...anchor});
    }
  }

  return connections;
}

async function findCategoryConnections(
  database: Database,
  anchorUids: string[],
): Promise<MovieConnection[]> {
  const anchorCategories = await database
    .select({
      anchorUid: nominations.movieUid,
      categoryUid: nominations.categoryUid,
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
    .where(
      and(
        inArray(nominations.movieUid, anchorUids),
        sql`+${nominations.personUid} IS NULL`,
        awardPageNominations(),
      ),
    );
  const anchorsByCategory = new Map<string, Anchor[]>();
  for (const category of anchorCategories) {
    const definition = findTopAwardPageDefinition(
      category.organizationName,
      category.categoryName,
    );
    if (definition) {
      addAnchor(anchorsByCategory, category.categoryUid, {
        anchorUid: category.anchorUid,
        name: `${definition.organization} ${definition.name}`,
      });
    }
  }

  if (anchorsByCategory.size === 0) {
    return [];
  }

  const deletedMovieUids = database
    .select({uid: movies.uid})
    .from(movies)
    .where(isNotNull(movies.deletedAt));
  const partnerNominations = await inChunks(
    anchorsByCategory.keys().toArray(),
    chunk =>
      database
        .select({
          categoryUid: nominations.categoryUid,
          movieUid: nominations.movieUid,
        })
        .from(nominations)
        .where(
          and(
            inArray(nominations.categoryUid, chunk),
            sql`+${nominations.personUid} IS NULL`,
            notInArray(nominations.movieUid, anchorUids),
            notInArray(nominations.movieUid, deletedMovieUids),
          ),
        )
        .orderBy(nominations.movieUid, nominations.categoryUid)
        .limit(MAX_CANDIDATES_PER_QUERY),
  );

  return partnerNominations.flatMap(nomination =>
    anchorsByCategory.get(nomination.categoryUid)!.map(anchor => ({
      kind: 'category' as const,
      movieUid: nomination.movieUid,
      ...anchor,
    })),
  );
}

export async function loadShowableMovies(
  database: Database,
  movieUids: string[],
): Promise<DoubleFeatureMovie[]> {
  if (movieUids.length === 0) {
    return [];
  }

  const rows = await inChunks(movieUids, chunk =>
    database
      .select({
        uid: movies.uid,
        year: movies.year,
        jaTitle: movieTitleColumns().jaTitle,
        posterUrl: localizedPosterUrl('ja').as('posterUrl'),
      })
      .from(movies)
      .where(and(inArray(movies.uid, chunk), isNull(movies.deletedAt))),
  );

  const showable: DoubleFeatureMovie[] = [];
  for (const uid of movieUids) {
    const row = rows.find(current => current.uid === uid);
    if (row?.jaTitle && row.posterUrl) {
      showable.push({
        uid,
        title: row.jaTitle,
        year: row.year ?? undefined,
        posterUrl: row.posterUrl,
      });
    }
  }

  return showable;
}
