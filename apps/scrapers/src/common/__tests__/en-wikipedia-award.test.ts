import {describe, expect, it} from 'vitest';
import {
  ceremonyNumberOf,
  ceremonyYearOf,
  type EnWikipediaAwardSource,
} from '../en-wikipedia-award';

const LINEAR: EnWikipediaAwardSource = {
  organizationName: 'British Academy Film Awards',
  organizationCountry: 'United Kingdom',
  firstCeremonyYear: 1948,
  ceremonyPage: 'British Academy Film Awards',
  categoryPrefix: 'BAFTA Award for ',
  publicationWindow: {min: -1, max: 1},
  resolutionOverrides: new Map(),
  personNameAliases: {},
};

const IRREGULAR: EnWikipediaAwardSource = {
  ...LINEAR,
  organizationName: 'Cannes Film Festival',
  firstCeremonyYear: 1946,
  ceremonyPage: undefined,
  ceremonyNumber: year => (year === 1946 ? 1 : year - 1947),
  ceremonyYear: number => (number === 1 ? 1946 : number + 1947),
};

describe('ceremonyYearOf', () => {
  it('第1回の年から数える', () => {
    expect(ceremonyYearOf(LINEAR, 22)).toBe(1969);
  });

  it('回次と年の対応が指定されていればそれを使う', () => {
    expect(ceremonyYearOf(IRREGULAR, 4)).toBe(1951);
  });
});

describe('ceremonyNumberOf', () => {
  it('第1回の年から数える', () => {
    expect(ceremonyNumberOf(LINEAR, 1969)).toBe(22);
  });

  it('回次と年の対応が指定されていればそれを使う', () => {
    expect(ceremonyNumberOf(IRREGULAR, 1951)).toBe(4);
  });
});
