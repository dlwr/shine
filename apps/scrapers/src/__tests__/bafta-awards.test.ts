import {describe, expect, it} from 'vitest';
import {BAFTA_AWARDS, BAFTA_SOURCE, baftaCeremonyYear} from '../bafta-awards';
import {awardConfig, toImdbEventData} from '../common/en-wikipedia-award';
import type {ResolvedFilm} from '../common/wikidata-film-resolver';

const BEST_FILM = BAFTA_AWARDS[0];
const BEST_DIRECTION = BAFTA_AWARDS[1];

const RESOLVED = new Map<string, ResolvedFilm>([
  ['The Graduate', {imdbId: 'tt0061722'}],
  ['Oliver! (film)', {imdbId: 'tt0063385'}],
  ['Hamlet (1948 film)', {imdbId: 'tt0040416'}],
]);

describe('BAFTA_AWARDS', () => {
  it('作品賞と監督賞と演技賞4部門を持つ', () => {
    expect(BAFTA_AWARDS.map(award => award.category)).toEqual([
      'BAFTA Award for Best Film',
      'BAFTA Award for Best Direction',
      'BAFTA Award for Best Actor in a Leading Role',
      'BAFTA Award for Best Actress in a Leading Role',
      'BAFTA Award for Best Actor in a Supporting Role',
      'BAFTA Award for Best Actress in a Supporting Role',
    ]);
  });

  it('作品賞だけ人物を引かない', () => {
    expect(BAFTA_AWARDS.map(award => award.role)).toEqual([
      undefined,
      'director',
      'actor',
      'actor',
      'actor',
      'actor',
    ]);
  });
});

describe('baftaCeremonyYear', () => {
  it('第1回を1948年として数える', () => {
    expect(baftaCeremonyYear(1)).toBe(1948);
    expect(baftaCeremonyYear(22)).toBe(1969);
    expect(baftaCeremonyYear(79)).toBe(2026);
  });
});

describe('toImdbEventData の作品賞', () => {
  const data = toImdbEventData(
    BAFTA_SOURCE,
    BEST_FILM,
    [
      {
        filmYear: 1948,
        ceremonyNumber: 2,
        entries: [
          {
            filmPage: 'Hamlet (1948 film)',
            filmTitle: 'Hamlet',
            isWinner: true,
          },
        ],
      },
    ],
    RESOLVED,
  );

  it('授賞式の年は回次から引く', () => {
    expect(data.editions.map(edition => edition.year)).toEqual([1949]);
  });

  it('ノミネーションに人物を載せない', () => {
    const [nomination] =
      data.editions[0].targetAward[0].categories[0].nominations;

    expect(nomination.titles[0].imdbId).toBe('tt0040416');
    expect(nomination.isWinner).toBe(true);
    expect(nomination.people).toBeUndefined();
  });
});

describe('toImdbEventData の監督賞', () => {
  const data = toImdbEventData(
    BAFTA_SOURCE,
    BEST_DIRECTION,
    [
      {
        filmYear: 1968,
        ceremonyNumber: 22,
        entries: [
          {
            personName: 'Mike Nichols',
            filmPage: 'The Graduate',
            filmTitle: 'The Graduate',
            isWinner: true,
          },
          {
            personName: 'Carol Reed',
            filmPage: 'Oliver! (film)',
            filmTitle: 'Oliver!',
            isWinner: false,
          },
        ],
      },
    ],
    RESOLVED,
  );

  it('ノミネーションに人物を載せる', () => {
    expect(
      data.editions[0].targetAward[0].categories[0].nominations.map(
        nomination => [
          nomination.titles[0].imdbId,
          nomination.people?.[0].name,
          nomination.isWinner,
        ],
      ),
    ).toEqual([
      ['tt0061722', 'Mike Nichols', true],
      ['tt0063385', 'Carol Reed', false],
    ]);
  });
});

describe('awardConfig', () => {
  it('英国アカデミー賞の組織に紐づける', () => {
    expect(awardConfig(BAFTA_SOURCE, BEST_FILM)).toMatchObject({
      organizationName: 'British Academy Film Awards',
      organizationCountry: 'United Kingdom',
      establishedYear: 1948,
      categoryName: 'BAFTA Award for Best Film',
      categoryShortName: 'Best Film',
      personRole: undefined,
    });
  });

  it('個人賞は人物を引くクレジットを持つ', () => {
    expect(awardConfig(BAFTA_SOURCE, BEST_DIRECTION).personRole).toBe(
      'director',
    );
  });

  it('授賞式の年から回次を引く', () => {
    const config = awardConfig(BAFTA_SOURCE, BEST_FILM);

    expect(config.ceremonyNumber(1948)).toBe(1);
    expect(config.ceremonyNumber(2026)).toBe(79);
  });
});

describe('BAFTA_SOURCE', () => {
  it('英国公開が数年遅れる初期の作品も同定できる年窓を持つ', () => {
    expect(BAFTA_SOURCE.publicationWindow).toEqual({min: -8, max: 1});
  });

  it('共通の別名表で人物を寄せる', () => {
    const data = toImdbEventData(
      BAFTA_SOURCE,
      BEST_DIRECTION,
      [
        {
          filmYear: 2006,
          ceremonyNumber: 60,
          entries: [
            {
              personName: 'Alejandro González Iñárritu',
              filmPage: 'Babel (film)',
              filmTitle: 'Babel',
              isWinner: false,
            },
          ],
        },
      ],
      new Map([['Babel (film)', {imdbId: 'tt0449467'}]]),
    );

    expect(
      data.editions[0].targetAward[0].categories[0].nominations[0].people,
    ).toEqual([{name: 'Alejandro G. Iñárritu'}]);
  });

  it('記事名から引けない作品は回次と表示名で直接指す', () => {
    const data = toImdbEventData(
      BAFTA_SOURCE,
      BAFTA_AWARDS[3],
      [
        {
          filmYear: 1960,
          ceremonyNumber: 14,
          entries: [
            {
              personName: 'Jean Simmons',
              filmPage: 'Elmer Gantry',
              filmTitle: 'Elmer Gantry',
              isWinner: false,
            },
          ],
        },
      ],
      new Map(),
    );

    expect(
      data.editions[0].targetAward[0].categories[0].nominations[0].titles[0]
        .imdbId,
    ).toBe('tt0053793');
  });
});
