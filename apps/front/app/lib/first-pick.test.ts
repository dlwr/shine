import {describe, expect, it} from 'vitest';
import {awardFirstPick, personFirstPick} from './first-pick';
import type {AwardDetailData, PersonData} from './api-types';

type Credit = PersonData['credits'][number];

function credit(overrides: Partial<Credit> & {movieUid: string}): Credit {
  return {
    title: overrides.movieUid,
    year: 2000,
    posterUrl: undefined,
    jobs: [],
    character: undefined,
    awards: [],
    personAwards: [],
    availabilityStatus: 'watchable',
    ...overrides,
  };
}

const personalWin = {
  slug: 'japan-academy-lead-actor',
  organization: '日本アカデミー賞',
  category: '最優秀主演男優賞',
  year: 2000,
  isWinner: true,
};

describe('personFirstPick', () => {
  it('日本で観られない参加作は選ばない', () => {
    expect(
      personFirstPick([
        credit({movieUid: 'a', availabilityStatus: 'unwatchable'}),
        credit({movieUid: 'b', availabilityStatus: 'unchecked'}),
        credit({movieUid: 'c', availabilityStatus: 'rental_only'}),
      ]),
    ).toBeUndefined();
  });

  it('本人が個人賞を取った作品を、作品の受賞作より先に選ぶ', () => {
    expect(
      personFirstPick([
        credit({movieUid: 'a', awards: [{slug: 'palme-dor', isWinner: true}]}),
        credit({movieUid: 'b', personAwards: [personalWin]}),
        credit({movieUid: 'c'}),
      ])?.movie.uid,
    ).toBe('b');
  });

  it('作品の受賞作を、賞の無い作品より先に選ぶ', () => {
    expect(
      personFirstPick([
        credit({movieUid: 'a'}),
        credit({movieUid: 'b', awards: [{slug: 'palme-dor', isWinner: true}]}),
        credit({movieUid: 'c', awards: [{slug: 'palme-dor', isWinner: false}]}),
      ])?.movie.uid,
    ).toBe('b');
  });

  it('同じ重みなら並びが先の（新しい）作品を選ぶ', () => {
    expect(
      personFirstPick([
        credit({movieUid: 'a', year: 2020}),
        credit({movieUid: 'b', year: 2010}),
        credit({movieUid: 'c', year: 2000}),
      ])?.movie.uid,
    ).toBe('a');
  });

  it('個人賞の受賞作には「受賞」と付ける', () => {
    expect(
      personFirstPick([credit({movieUid: 'a', personAwards: [personalWin]})])
        ?.label,
    ).toBe('受賞');
  });
});

type AwardMovie = AwardDetailData['years'][number]['movies'][number];

function movie(overrides: Partial<AwardMovie> & {uid: string}): AwardMovie {
  return {
    title: overrides.uid,
    movieYear: 2000,
    posterUrl: undefined,
    isWinner: true,
    availabilityStatus: 'watchable',
    ...overrides,
  };
}

function award(
  years: Array<{year: number; ceremonyNumber?: number; movies: AwardMovie[]}>,
) {
  return {
    grouping: 'year',
    years: years.map(group => ({
      ceremonyNumber: undefined,
      ...group,
      filmCount: group.movies.length,
    })),
  } as unknown as AwardDetailData;
}

describe('awardFirstPick', () => {
  it('日本で観られる受賞作のうち一番新しい回のものを選ぶ', () => {
    expect(
      awardFirstPick(
        award([
          {
            year: 2025,
            movies: [movie({uid: 'a', availabilityStatus: 'unchecked'})],
          },
          {year: 2024, movies: [movie({uid: 'b'})]},
          {year: 2023, movies: [movie({uid: 'c'})]},
        ]),
      )?.movie.uid,
    ).toBe('b');
  });

  it('ノミネート止まりの作品より受賞作を選ぶ', () => {
    expect(
      awardFirstPick(
        award([
          {
            year: 2025,
            movies: [
              movie({uid: 'a', isWinner: false}),
              movie({uid: 'b', isWinner: false}),
            ],
          },
          {year: 2024, movies: [movie({uid: 'c'})]},
        ]),
      )?.movie.uid,
    ).toBe('c');
  });

  it('一覧の先頭の回の受賞作は選ばず、次の回から選ぶ', () => {
    expect(
      awardFirstPick(
        award([
          {year: 2025, movies: [movie({uid: 'a'})]},
          {year: 2024, movies: [movie({uid: 'b'})]},
          {year: 2023, movies: [movie({uid: 'c'})]},
        ]),
      )?.movie.uid,
    ).toBe('b');
  });

  it('観られる受賞作が無ければ選ばない', () => {
    expect(
      awardFirstPick(
        award([
          {year: 2025, movies: [movie({uid: 'a'})]},
          {
            year: 2024,
            movies: [movie({uid: 'b', availabilityStatus: 'unwatchable'})],
          },
        ]),
      ),
    ).toBeUndefined();
  });

  it('回次があれば第N回をラベルにする', () => {
    expect(
      awardFirstPick(
        award([
          {year: 2025, ceremonyNumber: 49, movies: [movie({uid: 'a'})]},
          {year: 2024, ceremonyNumber: 48, movies: [movie({uid: 'b'})]},
        ]),
      )?.label,
    ).toBe('第48回');
  });

  it('回次が無ければ授賞式の年をラベルにする', () => {
    expect(
      awardFirstPick(
        award([
          {year: 2025, movies: [movie({uid: 'a'})]},
          {year: 2024, movies: [movie({uid: 'b'})]},
        ]),
      )?.label,
    ).toBe('2024');
  });
});
