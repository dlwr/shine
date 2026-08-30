import {pickWeeklyItem} from './weekly-rotation';

type RankedPerson = {uid: string; wonCount: number};

type ProminentPeople<T extends RankedPerson> = {
  directors: T[];
  actors: T[];
};

export type PersonRole = 'director' | 'actor';

/**
 * 監督・俳優の受賞者を uid 順（ランキングと無関係な並び）に並べ、週替わりで1人選ぶ
 */
export function pickPersonOfWeek<T extends RankedPerson>(
  {directors, actors}: ProminentPeople<T>,
  date: Date,
): (T & {role: PersonRole}) | undefined {
  const pool = [
    ...directors.map(person => ({...person, role: 'director' as const})),
    ...actors.map(person => ({...person, role: 'actor' as const})),
  ]
    .filter(person => person.wonCount > 0)
    .toSorted((a, b) => a.uid.localeCompare(b.uid));

  return pickWeeklyItem(pool, date);
}
