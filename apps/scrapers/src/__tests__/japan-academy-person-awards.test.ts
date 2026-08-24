import {describe, expect, it} from 'vitest';
import {extractAwardEditions} from '../imdb-event-award';
import {
  japanAcademyPersonConfig,
  japanAcademyPersonFilmReferences,
  toImdbEventData,
  type JapanAcademyPersonAward,
} from '../japan-academy-person-awards';
import type {JapanAcademyPersonEdition} from '../japan-academy-person-wikitext';
import type {ResolvedFilm} from '../common/wikidata-film-resolver';

const AWARD: JapanAcademyPersonAward = {
  article: '日本アカデミー賞助演男優賞',
  category: '助演男優賞',
  role: 'actor',
};

const EDITIONS: JapanAcademyPersonEdition[] = [
  {
    year: 2025,
    ceremonyNumber: 49,
    entries: [
      {
        personName: '佐藤二朗',
        personPage: '佐藤二朗',
        filmPage: '爆弾 (小説)',
        filmTitle: '爆弾',
        isWinner: true,
      },
      {
        personName: '横浜流星',
        personPage: '横浜流星',
        filmPage: '国宝 (小説)',
        filmTitle: '国宝',
        isWinner: false,
      },
      {
        personName: '渡辺謙',
        personPage: '渡辺謙',
        filmPage: '国宝 (小説)',
        filmTitle: '国宝',
        isWinner: false,
      },
    ],
  },
];

const RESOLVED = new Map<string, ResolvedFilm>([
  ['爆弾 (小説)', {imdbId: 'tt11111111', englishTitle: 'Bomb'}],
  ['国宝 (小説)', {imdbId: 'tt22222222', englishTitle: 'Kokuho'}],
]);

describe('japanAcademyPersonFilmReferences', () => {
  it('同じ作品は1件にまとめる', () => {
    const references = japanAcademyPersonFilmReferences(EDITIONS);

    expect(references.map(reference => reference.key)).toEqual([
      '爆弾 (小説)',
      '国宝 (小説)',
    ]);
  });

  it('対象作品の公開年を目標年にする', () => {
    const references = japanAcademyPersonFilmReferences(EDITIONS);

    expect(references[0].targetYear).toBe(2025);
  });
});

describe('toImdbEventData', () => {
  it('授賞式の年に変換する', () => {
    const data = toImdbEventData(AWARD, EDITIONS, RESOLVED);

    expect(data.editions[0].year).toBe(2026);
  });

  it('ノミネーションに人物を載せる', () => {
    const data = toImdbEventData(AWARD, EDITIONS, RESOLVED);

    expect(
      data.editions[0].targetAward[0].categories[0].nominations.map(
        nomination => nomination.people?.[0].name,
      ),
    ).toEqual(['佐藤二朗', '横浜流星', '渡辺謙']);
  });

  it('芸名が違う人物は別名に置き換える', () => {
    const data = toImdbEventData(
      AWARD,
      [
        {
          year: 1997,
          ceremonyNumber: 21,
          entries: [
            {
              personName: '北野武',
              personPage: '北野武',
              filmPage: '爆弾 (小説)',
              filmTitle: '爆弾',
              isWinner: false,
            },
          ],
        },
      ],
      RESOLVED,
    );

    expect(
      data.editions[0].targetAward[0].categories[0].nominations[0].people?.[0]
        .name,
    ).toBe('ビートたけし');
  });

  it('直指定した作品はWikidataで引けなくても取り込む', () => {
    const data = toImdbEventData(
      AWARD,
      [
        {
          year: 2011,
          ceremonyNumber: 35,
          entries: [
            {
              personName: '井上真央',
              personPage: '井上真央',
              filmPage: '八日目の蝉',
              filmTitle: '八日目の蝉',
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
    ).toBe('tt1727825');
  });

  it('同定できなかった作品は落とす', () => {
    const data = toImdbEventData(AWARD, EDITIONS, new Map());

    expect(data.editions[0].targetAward[0].categories[0].nominations).toEqual(
      [],
    );
  });

  it('同じ作品の複数の人物を1つの作品にまとめる', () => {
    const [edition] = extractAwardEditions(
      toImdbEventData(AWARD, EDITIONS, RESOLVED),
      japanAcademyPersonConfig(AWARD),
    );

    expect(
      edition.films.find(film => film.imdbId === 'tt22222222')?.people,
    ).toEqual([
      {name: '横浜流星', isWinner: false},
      {name: '渡辺謙', isWinner: false},
    ]);
  });

  it('受賞は人物ごとに保つ', () => {
    const [edition] = extractAwardEditions(
      toImdbEventData(AWARD, EDITIONS, RESOLVED),
      japanAcademyPersonConfig(AWARD),
    );

    expect(
      edition.films.find(film => film.imdbId === 'tt11111111')?.people,
    ).toEqual([{name: '佐藤二朗', isWinner: true}]);
  });
});

describe('japanAcademyPersonConfig', () => {
  it('部門名をカテゴリにする', () => {
    expect(japanAcademyPersonConfig(AWARD).categoryName).toBe('助演男優賞');
  });

  it('回次は授賞式の年から1977を引く', () => {
    expect(japanAcademyPersonConfig(AWARD).ceremonyNumber(2026)).toBe(49);
  });

  it('監督賞は監督クレジットから人物を引き当てる', () => {
    expect(
      japanAcademyPersonConfig({
        article: '日本アカデミー賞監督賞',
        category: '監督賞',
        role: 'director',
      }).personRole,
    ).toBe('director');
  });
});
