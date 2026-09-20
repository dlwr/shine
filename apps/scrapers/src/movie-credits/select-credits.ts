import {type TMDBCredits} from '@shine/tmdb';

export type SelectedCredit = {
  creditId: string;
  tmdbPersonId: number;
  name: string;
  localizedName: string;
  englishName?: string;
  profilePath: string | undefined;
  department: string;
  job: string | undefined;
  character: string | undefined;
  castOrder: number | undefined;
};

const MAX_CAST = 10;

const CREW_JOBS = new Set([
  'Director',
  'Screenplay',
  'Writer',
  'Story',
  'Director of Photography',
  'Original Music Composer',
  'Editor',
]);

export function selectCredits(
  credits: TMDBCredits,
  englishCredits?: TMDBCredits,
): SelectedCredit[] {
  const englishNames = new Map(
    [...(englishCredits?.cast ?? []), ...(englishCredits?.crew ?? [])].map(
      member => [member.id, member.name],
    ),
  );
  const cast = credits.cast
    .toSorted((a, b) => a.order - b.order)
    .slice(0, MAX_CAST)
    .map(member => ({
      creditId: member.credit_id,
      tmdbPersonId: member.id,
      name: member.original_name,
      localizedName: member.name,
      englishName: englishNames.get(member.id),
      profilePath: member.profile_path ?? undefined,
      department: 'Acting',
      job: undefined,
      character: member.character ?? undefined,
      castOrder: member.order,
    }));

  const crew = credits.crew
    .filter(member => CREW_JOBS.has(member.job))
    .map(member => ({
      creditId: member.credit_id,
      tmdbPersonId: member.id,
      name: member.original_name,
      localizedName: member.name,
      englishName: englishNames.get(member.id),
      profilePath: member.profile_path ?? undefined,
      department: member.department,
      job: member.job,
      character: undefined,
      castOrder: undefined,
    }));

  return [...cast, ...crew];
}
