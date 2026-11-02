import type {PersonAwardDetailData} from './api-types';

export type AwardRegular = {
  uid: string;
  name: string;
  wins: number;
  nominations: number;
};

const MIN_NOMINATIONS = 2;
const MIN_REGULARS = 3;

export function awardRegulars(
  award: PersonAwardDetailData,
  limit = 5,
): AwardRegular[] {
  const byPerson = new Map<string, AwardRegular>();
  for (const group of award.years) {
    for (const nominee of group.nominees) {
      const regular = byPerson.get(nominee.uid) ?? {
        uid: nominee.uid,
        name: nominee.name,
        wins: 0,
        nominations: 0,
      };
      regular.nominations += 1;
      if (nominee.isWinner) {
        regular.wins += 1;
      }

      byPerson.set(nominee.uid, regular);
    }
  }

  const regulars = [...byPerson.values()]
    .filter(regular => regular.nominations >= MIN_NOMINATIONS)
    .toSorted(
      (a, b) =>
        b.wins - a.wins ||
        b.nominations - a.nominations ||
        a.name.localeCompare(b.name, 'ja'),
    );
  return regulars.length >= MIN_REGULARS ? regulars.slice(0, limit) : [];
}
