import {describe, expect, it} from 'vitest';
import {
  ceremonyNumberOf,
  ceremonyYearOf,
  parseAwardEditions,
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

describe('parseAwardEditions', () => {
  const wikitext = `
== Winners ==
{| class="wikitable"
! Year
! Director
! Film
|-
! [[1990 in film|1990]]
| [[Martin Scorsese]]
| ''[[Goodfellas]]''
|}

== Silver Lion for Best Direction ==
{| class="wikitable"
! Year
! Director
! Film
|-
! [[1999 in film|1999]]
| [[Zhang Yuan]]
| ''[[Seventeen Years (film)|Seventeen Years]]''
|}
`;
  const source: EnWikipediaAwardSource = {
    ...LINEAR,
    ceremonyPage: undefined,
    sectionHeading: /^==\s*Winners\s*==/im,
    winnersOnly: true,
  };

  it('部門に節見出しがあれば組織の見出しより優先する', () => {
    const editions = parseAwardEditions(
      source,
      {
        article: 'Silver Lion',
        category: 'Best Director',
        role: 'director',
        sectionHeading: /^==\s*Silver Lion for Best Direction\s*==/im,
      },
      wikitext,
    );

    expect(editions.map(edition => edition.filmYear)).toEqual([1999]);
  });

  it('部門に節見出しが無ければ組織の見出しを使う', () => {
    const editions = parseAwardEditions(
      source,
      {article: 'Volpi Cup', category: 'Best Actor', role: 'actor'},
      wikitext,
    );

    expect(editions.map(edition => edition.filmYear)).toEqual([1990]);
  });
});
