import {describe, expect, it} from 'vitest';
import {extractAwardEditions} from '../imdb-event-award';
import {
  ACADEMY_PERSON_AWARDS,
  academyPersonConfig,
  academyPersonFilmReferences,
  toImdbEventData,
  type AcademyPersonAward,
} from '../academy-person-awards';
import type {AcademyPersonEdition} from '../academy-person-wikitext';
import type {ResolvedFilm} from '../common/wikidata-film-resolver';

const AWARD: AcademyPersonAward = {
  article: 'Academy Award for Best Supporting Actor',
  category: 'Academy Award for Best Supporting Actor',
  role: 'actor',
};

const EDITIONS: AcademyPersonEdition[] = [
  {
    filmYear: 1927,
    ceremonyNumber: 1,
    entries: [
      {
        personName: 'Emil Jannings',
        filmPage: 'The Last Command (1928 film)',
        filmTitle: 'The Last Command',
        isWinner: true,
      },
      {
        personName: 'Emil Jannings',
        filmPage: 'The Way of All Flesh (1927 film)',
        filmTitle: 'The Way of All Flesh',
        isWinner: true,
      },
      {
        personName: 'Richard Barthelmess',
        filmPage: undefined,
        filmTitle: 'The Noose',
        isWinner: false,
      },
      {
        personName: 'Charlie Chaplin',
        filmPage: 'The Circus (1928 film)',
        filmTitle: 'The Circus',
        isWinner: false,
      },
    ],
  },
  {
    filmYear: 2022,
    ceremonyNumber: 95,
    entries: [
      {
        personName: 'Ke Huy Quan',
        filmPage: 'Everything Everywhere All at Once',
        filmTitle: 'Everything Everywhere All at Once',
        isWinner: true,
      },
      {
        personName: 'Brendan Gleeson',
        filmPage: 'The Banshees of Inisherin',
        filmTitle: 'The Banshees of Inisherin',
        isWinner: false,
      },
      {
        personName: 'Barry Keoghan',
        filmPage: 'The Banshees of Inisherin',
        filmTitle: 'The Banshees of Inisherin',
        isWinner: false,
      },
    ],
  },
];

const RESOLVED = new Map<string, ResolvedFilm>([
  ['The Last Command (1928 film)', {imdbId: 'tt0018379'}],
  ['The Way of All Flesh (1927 film)', {imdbId: 'tt0018553'}],
  ['The Noose', {imdbId: 'tt0018221'}],
  [
    'Everything Everywhere All at Once',
    {imdbId: 'tt6710474', englishTitle: 'Everything Everywhere All at Once'},
  ],
  ['The Banshees of Inisherin', {imdbId: 'tt11813216'}],
]);

describe('ACADEMY_PERSON_AWARDS', () => {
  it('監督賞と演技賞4部門を持つ', () => {
    expect(ACADEMY_PERSON_AWARDS.map(award => award.category)).toEqual([
      'Academy Award for Best Director',
      'Academy Award for Best Actor',
      'Academy Award for Best Actress',
      'Academy Award for Best Supporting Actor',
      'Academy Award for Best Supporting Actress',
    ]);
  });

  it('監督賞だけ監督のクレジットから引く', () => {
    expect(ACADEMY_PERSON_AWARDS.map(award => award.role)).toEqual([
      'director',
      'actor',
      'actor',
      'actor',
      'actor',
    ]);
  });
});

describe('academyPersonFilmReferences', () => {
  const references = academyPersonFilmReferences(EDITIONS);

  it('同じ作品は1件にまとめる', () => {
    expect(references.map(reference => reference.key)).toEqual([
      'The Last Command (1928 film)',
      'The Way of All Flesh (1927 film)',
      'The Noose',
      'The Circus (1928 film)',
      'Everything Everywhere All at Once',
      'The Banshees of Inisherin',
    ]);
  });

  it('対象作品の公開年を目標年にする', () => {
    expect(references[0].targetYear).toBe(1927);
  });

  it('記事名の無い作品は表示名をキーにする', () => {
    expect(references[2]).toMatchObject({key: 'The Noose', title: 'The Noose'});
  });
});

describe('toImdbEventData', () => {
  const data = toImdbEventData(AWARD, EDITIONS, RESOLVED);

  it('授賞式の年は第1回を1929年として数える', () => {
    expect(data.editions.map(edition => edition.year)).toEqual([1929, 2023]);
  });

  it('ノミネーションに人物を載せる', () => {
    expect(
      data.editions[1].targetAward[0].categories[0].nominations.map(
        nomination => [
          nomination.titles[0].imdbId,
          nomination.people?.[0].name,
          nomination.isWinner,
        ],
      ),
    ).toEqual([
      ['tt6710474', 'Ke Huy Quan', true],
      ['tt11813216', 'Brendan Gleeson', false],
      ['tt11813216', 'Barry Keoghan', false],
    ]);
  });

  it('同定できない作品は落とす', () => {
    expect(
      data.editions[0].targetAward[0].categories[0].nominations.map(
        nomination => nomination.titles[0].imdbId,
      ),
    ).toEqual(['tt0018379', 'tt0018553', 'tt0018221']);
  });

  it('extractAwardEditions で同じ作品の候補者がまとまる', () => {
    const editions = extractAwardEditions(data, academyPersonConfig(AWARD));

    expect(
      editions[1].films.map(film => [
        film.imdbId,
        film.people?.map(person => person.name),
      ]),
    ).toEqual([
      ['tt6710474', ['Ke Huy Quan']],
      ['tt11813216', ['Brendan Gleeson', 'Barry Keoghan']],
    ]);
  });
});

describe('academyPersonConfig', () => {
  const config = academyPersonConfig(AWARD);

  it('既存のアカデミー賞の組織に紐づける', () => {
    expect(config).toMatchObject({
      organizationName: 'Academy Awards',
      organizationCountry: 'United States',
      establishedYear: 1929,
      categoryName: 'Academy Award for Best Supporting Actor',
      categoryShortName: 'Best Supporting Actor',
      personRole: 'actor',
    });
  });

  it('授賞式の年から回次を引く', () => {
    expect(config.ceremonyNumber(1929)).toBe(1);
    expect(config.ceremonyNumber(2026)).toBe(98);
  });
});
