import {eq, type getDatabase} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {people} from '@shine/database/schema/people';
import {personLocalizedName} from './person-name';
import type {MovieSelection} from '../types/movies';

const CREW_JOB_ORDER = [
  'Director',
  'Screenplay',
  'Writer',
  'Story',
  'Director of Photography',
  'Editor',
  'Original Music Composer',
];

function crewJobRank(job: string): number {
  const index = CREW_JOB_ORDER.indexOf(job);
  return index === -1 ? CREW_JOB_ORDER.length : index;
}

export async function loadMovieCredits(
  database: ReturnType<typeof getDatabase>,
  movieId: string,
  locale: string,
): Promise<MovieSelection['credits']> {
  const rows = await database
    .select({
      personUid: people.uid,
      name: people.name,
      profilePath: people.profilePath,
      department: movieCredits.department,
      job: movieCredits.job,
      character: movieCredits.character,
      castOrder: movieCredits.castOrder,
      localizedName: personLocalizedName(locale),
    })
    .from(movieCredits)
    .innerJoin(people, eq(people.uid, movieCredits.personUid))
    .where(eq(movieCredits.movieUid, movieId));

  if (rows.length === 0) {
    return undefined;
  }

  const displayName = (row: (typeof rows)[number]) =>
    row.localizedName ?? row.name;

  const cast = rows
    .filter(row => row.department === 'Acting')
    .toSorted((a, b) => (a.castOrder ?? 0) - (b.castOrder ?? 0))
    .map(row => ({
      uid: row.personUid,
      name: displayName(row),
      character: row.character ?? undefined,
      profilePath: row.profilePath ?? undefined,
    }));

  const crew = rows
    .filter(row => row.job !== null)
    .toSorted((a, b) => crewJobRank(a.job ?? '') - crewJobRank(b.job ?? ''))
    .map(row => ({
      uid: row.personUid,
      name: displayName(row),
      job: row.job ?? '',
      profilePath: row.profilePath ?? undefined,
    }));

  return {cast, crew};
}
