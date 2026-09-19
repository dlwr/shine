import {describe, expect, it} from 'vitest';
import {
  collectJapaneseTitles,
  filmAwardConfig,
  filmAwardReferences,
  toFilmAwardEventData,
  type FilmAwardSource,
} from '../common/ja-wikipedia-film-award-source';
import {
  collectAwardLineFilms,
  parseBracketedFilms,
  splitEditions,
  type WikiFilm,
} from '../common/ja-wikipedia-film-award-wikitext';

type Edition = {year: number; best: WikiFilm[]; foreign: WikiFilm[]};

const source: FilmAwardSource<Edition> = {
  article: 'テスト映画賞',
  organizationName: 'Test Film Awards',
  establishedYear: 2000,
  ceremonyNumber: year => (year >= 2000 ? year - 1999 : undefined),
  categories: [
    {category: '作品賞', films: edition => edition.best},
    {category: '外国作品賞', films: edition => edition.foreign, foreign: true},
  ],
  resolutionOverrides: new Map([['2001:直指定', 'tt0000099']]),
};

const editions: Edition[] = [
  {
    year: 2000,
    best: [{page: '映画A (映画)', title: '映画A'}],
    foreign: [{title: 'Foreign B'}],
  },
  {
    year: 2001,
    best: [{title: '直指定'}, {page: '映画C', title: '映画C'}],
    foreign: [],
  },
  {year: 2002, best: [{page: '未解決', title: '未解決'}], foreign: []},
];

const resolved = new Map([
  ['映画A (映画)', {imdbId: 'tt0000001', englishTitle: 'Film A'}],
  ['title:Foreign B', {imdbId: 'tt0000002', englishTitle: 'Foreign B'}],
  ['映画C', {imdbId: 'tt0000003', englishTitle: undefined}],
]);

describe('splitEditions', () => {
  const heading =
    /^====\s*(?:\[\[[^\]|]+\|)?第(\d+)回（(\d{4})年度）(?:]])?\s*====\s*$/m;
  const wikitext = `== 概要 ==
本文。
==== 第1回（2000年度） ====
*作品賞 『[[映画A]]』
==== [[第2回|第2回（2001年度）]] ====
*作品賞 『[[映画B]]』
== 脚注 ==
*作品賞 『[[脚注の作品]]』
`;

  it('回の見出しごとに年度と本文に分ける', () => {
    expect(splitEditions(wikitext, heading)).toEqual([
      {ceremonyNumber: 1, year: 2000, body: '\n*作品賞 『[[映画A]]』\n'},
      {ceremonyNumber: 2, year: 2001, body: '\n*作品賞 『[[映画B]]』\n'},
    ]);
  });
});

describe('parseBracketedFilms', () => {
  it('『』内のリンクから記事名と表示名を取り出す', () => {
    expect(
      parseBracketedFilms('『[[映画A (映画)#節|映画A]]』（監督）『[[映画B]]』'),
    ).toEqual([
      {page: '映画A (映画)', title: '映画A'},
      {page: '映画B', title: '映画B'},
    ]);
  });

  it('リンクの無い題名は表示名だけを持つ', () => {
    expect(parseBracketedFilms('『裸の題名{{要出典}}』')).toEqual([
      {title: '裸の題名'},
    ]);
  });

  it('『』が無く裸リンクだけの行も取り込む', () => {
    expect(parseBracketedFilms('[[ダークナイト]]（監督）')).toEqual([
      {page: 'ダークナイト', title: 'ダークナイト'},
    ]);
  });

  it('空の『』を数えない', () => {
    expect(parseBracketedFilms('『』')).toEqual([]);
  });
});

describe('collectAwardLineFilms', () => {
  it('賞名ごとの行から作品を集め、出典の中の題名を読まない', () => {
    const best: WikiFilm[] = [];
    const body = `*作品賞 『[[映画A]]』<ref>『別の映画』</ref>
*主演男優賞 [[俳優]]（『[[映画B]]』）
**サブ項目 『[[映画C]]』
`;
    collectAwardLineFilms(body, name => (name === '作品賞' ? best : undefined));
    expect(best).toEqual([{page: '映画A', title: '映画A'}]);
  });
});

describe('filmAwardReferences', () => {
  const references = filmAwardReferences(source, editions);

  it('記事名か表示名を鍵にする', () => {
    expect(references.map(reference => reference.key)).toEqual([
      '映画A (映画)',
      'title:Foreign B',
      '映画C',
      '未解決',
    ]);
  });

  it('日本映画は前後1年、外国映画は年度より前を許容する窓を持つ', () => {
    expect(references[0]).toMatchObject({
      targetYear: 2000,
      yearWindow: {min: -1, max: 1},
      foreign: false,
    });
    expect(references[1]).toMatchObject({
      yearWindow: {min: -Infinity, max: 1},
      foreign: true,
    });
  });

  it('直指定した作品を同定の対象から外す', () => {
    expect(references.map(reference => reference.title)).not.toContain(
      '直指定',
    );
  });
});

describe('toFilmAwardEventData', () => {
  const data = toFilmAwardEventData(source, editions, resolved, '2026-01-01');

  it('部門ごとに受賞として取り込む', () => {
    expect(data.source).toBe('https://ja.wikipedia.org/wiki/テスト映画賞');
    expect(data.editions[0]).toEqual({
      year: 2000,
      awardNames: ['作品賞', '外国作品賞'],
      targetAward: [
        {
          categories: [
            {
              category: '作品賞',
              total: null,
              nominations: [
                {
                  isWinner: true,
                  notes: null,
                  titles: [
                    {
                      imdbId: 'tt0000001',
                      title: '映画A',
                      originalTitle: 'Film A',
                    },
                  ],
                },
              ],
            },
            {
              category: '外国作品賞',
              total: null,
              nominations: [
                {
                  isWinner: true,
                  notes: null,
                  titles: [
                    {
                      imdbId: 'tt0000002',
                      title: 'Foreign B',
                      originalTitle: 'Foreign B',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('直指定のIMDb IDで取り込む', () => {
    const titles =
      data.editions[1].targetAward[0].categories[0].nominations.map(
        nomination => nomination.titles[0],
      );
    expect(titles).toEqual([
      {imdbId: 'tt0000099', title: '直指定', originalTitle: null},
      {imdbId: 'tt0000003', title: '映画C', originalTitle: null},
    ]);
  });

  it('解決できた作品が無い回を取り込まない', () => {
    expect(data.editions.map(edition => edition.year)).toEqual([2000, 2001]);
  });

  it('順位付きの部門は受賞と注記を作品ごとに決める', () => {
    type Ranked = {year: number; bestTen: Array<WikiFilm & {rank: number}>};
    const ranked: FilmAwardSource<Ranked, WikiFilm & {rank: number}> = {
      ...source,
      categories: [
        {
          category: 'ベストテン',
          films: edition => edition.bestTen,
          nomination: film => ({
            isWinner: film.rank === 1,
            notes: `${film.rank}位`,
          }),
        },
      ],
    };
    const nominations = toFilmAwardEventData(
      ranked,
      [
        {
          year: 2000,
          bestTen: [
            {rank: 1, page: '映画A (映画)', title: '映画A'},
            {rank: 2, page: '映画C', title: '映画C'},
          ],
        },
      ],
      resolved,
    ).editions[0].targetAward[0].categories[0].nominations;
    expect(nominations.map(entry => [entry.isWinner, entry.notes])).toEqual([
      [true, '1位'],
      [false, '2位'],
    ]);
  });

  it('同じ映画を同じ部門に二度入れない', () => {
    const nominations = toFilmAwardEventData(
      source,
      [
        {
          year: 2000,
          best: [
            {page: '映画A (映画)', title: '映画A'},
            {page: '映画A (映画)', title: '映画A 完全版'},
          ],
          foreign: [],
        },
      ],
      resolved,
    ).editions[0].targetAward[0].categories[0].nominations;
    expect(nominations).toHaveLength(1);
  });
});

describe('filmAwardConfig', () => {
  const config = filmAwardConfig(source, '外国作品賞');

  it('団体と部門の設定を組む', () => {
    expect(config).toMatchObject({
      organizationName: 'Test Film Awards',
      organizationCountry: 'Japan',
      establishedYear: 2000,
      categoryName: '外国作品賞',
      minimumFilmsPerEdition: 1,
    });
    expect(config.ceremonyNumber(2001)).toBe(2);
    expect(config.isCompetitionCategory('外国作品賞')).toBe(true);
    expect(config.isCompetitionCategory('作品賞')).toBe(false);
  });

  it('無い部門は例外', () => {
    expect(() => filmAwardConfig(source, '無い賞')).toThrow('無い賞');
  });
});

describe('collectJapaneseTitles', () => {
  it('解決できた映画の日本語表記をIMDb IDごとに1つ集める', () => {
    expect(collectJapaneseTitles(source, editions, resolved)).toEqual(
      new Map([
        ['tt0000001', '映画A'],
        ['tt0000099', '直指定'],
        ['tt0000003', '映画C'],
      ]),
    );
  });
});
