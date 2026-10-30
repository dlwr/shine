import {and, eq, inArray, isNull, or} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import type {Column, SQLWrapper} from 'drizzle-orm';
import {alias} from 'drizzle-orm/sqlite-core';
import type {
  ConnectHops,
  ConnectLink,
  ConnectMovie,
  ConnectPick,
  ConnectRole,
  MovieConnection,
} from '../types/connect';
import {simpleHash} from '../utils/hash';
import {BaseService} from './base-service';
import {loadShowableMovies} from './movie-connections';
import {localizedMovieTitle} from './movie-title-columns';
import {personLocalizedName} from './person-name';
import {pickNominatedMovieUid} from './selection-pick';

const MAX_PEOPLE = 3;
const MAX_PICK_ATTEMPTS = 10;
export const MAX_NEIGHBOR_MOVIES = 300;
const HOP_DEPTH = 2;
const MAX_HOPS = 12;

type Credit = {movieUid: string; personUid: string; isDirector: boolean};

type Step = {previousMovieUid: string; personUid: string};

const sharedPeopleCredits = alias(movieCredits, 'shared_people_credits');
const seedCredits = alias(movieCredits, 'seed_credits');

function linkingRole(table: {job: Column; department: Column}) {
  return or(eq(table.job, 'Director'), eq(table.department, 'Acting'));
}

function byUid(a: string, b: string) {
  return a.localeCompare(b);
}

function roleBetween(
  credits: Credit[],
  personUid: string,
  movieUids: [string, string],
): ConnectRole {
  const directorFlags = movieUids.map(movieUid =>
    credits
      .filter(
        credit =>
          credit.movieUid === movieUid && credit.personUid === personUid,
      )
      .map(credit => credit.isDirector),
  );
  if (directorFlags.every(flags => flags.includes(true))) {
    return 'director';
  }

  if (directorFlags.every(flags => flags.includes(false))) {
    return 'cast';
  }

  return 'director-and-cast';
}

function explore(credits: Credit[], fromUid: string, maxDepth: number) {
  const peopleByMovie = new Map<string, Set<string>>();
  const moviesByPerson = new Map<string, Set<string>>();
  for (const {movieUid, personUid} of credits) {
    peopleByMovie.set(
      movieUid,
      (peopleByMovie.get(movieUid) ?? new Set()).add(personUid),
    );
    moviesByPerson.set(
      personUid,
      (moviesByPerson.get(personUid) ?? new Set()).add(movieUid),
    );
  }

  const reachedBy = new Map<string, Step | undefined>([[fromUid, undefined]]);
  const levels: string[][] = [];
  let frontier = [fromUid];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const movieUid of frontier) {
      const personUids = [...(peopleByMovie.get(movieUid) ?? [])].toSorted(
        byUid,
      );
      for (const personUid of personUids) {
        const movieUids = [...(moviesByPerson.get(personUid) ?? [])].toSorted(
          byUid,
        );
        for (const nextUid of movieUids) {
          if (reachedBy.has(nextUid)) {
            continue;
          }

          reachedBy.set(nextUid, {previousMovieUid: movieUid, personUid});
          next.push(nextUid);
        }
      }
    }

    levels.push(next);
    frontier = next;
  }

  return {reachedBy, levels};
}

function pathTo(
  reachedBy: Map<string, Step | undefined>,
  movieUid: string,
): Step[] {
  const steps: Step[] = [];
  for (
    let step = reachedBy.get(movieUid);
    step;
    step = reachedBy.get(step.previousMovieUid)
  ) {
    steps.unshift(step);
  }

  return steps;
}

function alternateByYearDistance<T extends {year: number | undefined}>(
  items: T[],
  year: number | undefined,
): T[] {
  if (year === undefined) {
    return items;
  }

  const farthestFirst = (a: T, b: T) =>
    Math.abs(b.year! - year) - Math.abs(a.year! - year);
  const older = items
    .filter(item => item.year !== undefined && item.year <= year)
    .toSorted(farthestFirst);
  const newer = items
    .filter(item => item.year !== undefined && item.year > year)
    .toSorted(farthestFirst);
  return Array.from(
    {length: Math.max(older.length, newer.length)},
    (_, index) =>
      [older[index], newer[index]].filter(item => item !== undefined),
  ).flat();
}

export class ConnectService extends BaseService {
  async connect(
    fromUid: string,
    toUid: string,
  ): Promise<MovieConnection | undefined> {
    const endpoints = await this.loadMovies([fromUid, toUid]);
    const from = endpoints.get(fromUid);
    const to = endpoints.get(toUid);
    if (!from || !to) {
      return undefined;
    }

    const credits = [
      ...(await this.loadNeighborhood(fromUid)),
      ...(await this.loadNeighborhood(toUid)),
    ];
    const {reachedBy} = explore(credits, fromUid, MAX_PEOPLE);
    if (!reachedBy.has(toUid)) {
      return {from, to, links: undefined};
    }

    const [links] = await this.describePaths(credits, [
      {steps: pathTo(reachedBy, toUid), toUid},
    ]);
    return {from, to, links};
  }

  async hops(fromUid: string): Promise<ConnectHops | undefined> {
    const endpoints = await this.loadMovies([fromUid]);
    const from = endpoints.get(fromUid);
    if (!from) {
      return undefined;
    }

    const credits = await this.loadNeighborhood(fromUid, HOP_DEPTH);
    const {reachedBy, levels} = explore(credits, fromUid, HOP_DEPTH);
    const destinations = alternateByYearDistance(
      await loadShowableMovies(this.database, levels[HOP_DEPTH - 1] ?? []),
      from.year,
    ).slice(0, MAX_HOPS);
    const linkLists = await this.describePaths(
      credits,
      destinations.map(movie => ({
        steps: pathTo(reachedBy, movie.uid),
        toUid: movie.uid,
      })),
    );
    return {
      from,
      hops: destinations.map((movie, index) => ({
        posterUrl: movie.posterUrl,
        links: linkLists[index],
      })),
    };
  }

  async pick(date: string): Promise<ConnectPick | undefined> {
    for (let attempt = 0; attempt < MAX_PICK_ATTEMPTS; attempt++) {
      const from = await pickNominatedMovieUid(
        this.database,
        simpleHash(`connect-from-${date}-${attempt}`),
      );
      const to =
        from &&
        (await pickNominatedMovieUid(
          this.database,
          simpleHash(`connect-to-${date}-${attempt}`),
          [from],
        ));
      if (!from || !to) {
        return undefined;
      }

      const connection = await this.connect(from, to);
      if (connection?.links) {
        return {date, from, to};
      }
    }

    return undefined;
  }

  private async describePaths(
    credits: Credit[],
    paths: Array<{steps: Step[]; toUid: string}>,
  ): Promise<ConnectLink[][]> {
    const movieUidLists = paths.map(({steps, toUid}) => [
      ...steps.map(step => step.previousMovieUid),
      toUid,
    ]);
    const pathMovies = await this.loadMovies([
      ...new Set(movieUidLists.flat()),
    ]);
    const names = await this.loadPersonNames([
      ...new Set(paths.flatMap(({steps}) => steps.map(step => step.personUid))),
    ]);
    return paths.map(({steps}, pathIndex) => {
      const movieUids = movieUidLists[pathIndex];
      return steps.map((step, index) => ({
        person: {uid: step.personUid, name: names.get(step.personUid)!},
        role: roleBetween(credits, step.personUid, [
          step.previousMovieUid,
          movieUids[index + 1],
        ]),
        movie: pathMovies.get(movieUids[index + 1])!,
      }));
    });
  }

  private async loadNeighborhood(
    movieUid: string,
    depth = 1,
  ): Promise<Credit[]> {
    let personUids: SQLWrapper = this.database
      .select({personUid: seedCredits.personUid})
      .from(seedCredits)
      .where(and(eq(seedCredits.movieUid, movieUid), linkingRole(seedCredits)));
    const neighborMovieUidLists: SQLWrapper[] = [];
    for (let hop = 0; hop < depth; hop++) {
      const neighborMovieUids = this.database
        .selectDistinct({movieUid: sharedPeopleCredits.movieUid})
        .from(sharedPeopleCredits)
        .innerJoin(movies, eq(movies.uid, sharedPeopleCredits.movieUid))
        .where(
          and(
            isNull(movies.deletedAt),
            linkingRole(sharedPeopleCredits),
            inArray(sharedPeopleCredits.personUid, personUids),
          ),
        )
        .orderBy(sharedPeopleCredits.movieUid)
        .limit(MAX_NEIGHBOR_MOVIES);
      neighborMovieUidLists.push(neighborMovieUids);
      personUids = this.database
        .select({personUid: movieCredits.personUid})
        .from(movieCredits)
        .where(
          and(
            inArray(movieCredits.movieUid, neighborMovieUids),
            linkingRole(movieCredits),
          ),
        );
    }

    const rows = await this.database
      .select({
        movieUid: movieCredits.movieUid,
        personUid: movieCredits.personUid,
        job: movieCredits.job,
      })
      .from(movieCredits)
      .where(
        and(
          or(
            ...neighborMovieUidLists.map(neighborMovieUids =>
              inArray(movieCredits.movieUid, neighborMovieUids),
            ),
          ),
          linkingRole(movieCredits),
        ),
      );
    return rows.map(row => ({
      movieUid: row.movieUid,
      personUid: row.personUid,
      isDirector: row.job === 'Director',
    }));
  }

  private async loadMovies(
    movieUids: string[],
  ): Promise<Map<string, ConnectMovie>> {
    const rows = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        title: localizedMovieTitle('ja'),
      })
      .from(movies)
      .where(and(inArray(movies.uid, movieUids), isNull(movies.deletedAt)));
    return new Map(
      rows.map(row => [
        row.uid,
        {uid: row.uid, title: row.title ?? '', year: row.year ?? undefined},
      ]),
    );
  }

  private async loadPersonNames(
    personUids: string[],
  ): Promise<Map<string, string>> {
    const rows = await this.database
      .select({
        uid: people.uid,
        name: people.name,
        localizedName: personLocalizedName('ja'),
      })
      .from(people)
      .where(inArray(people.uid, personUids));
    return new Map(rows.map(row => [row.uid, row.localizedName ?? row.name]));
  }
}
