/* eslint-disable unicorn/no-null -- ImdbEventCollectedDataの型に合わせる */
import {describe, expect, it} from 'vitest';
import {
  listPersonAwardConfig,
  listPersonAwardFilmReferences,
  parseListPersonAwardWikitext,
  toImdbEventData,
  type ListPersonAwardCategory,
  type ListPersonAwardEdition,
  type ListPersonAwardSource,
} from '../common/ja-wikipedia-person-award';
import type {ResolvedFilm} from '../common/wikidata-film-resolver';

const CATEGORIES: ListPersonAwardCategory[] = [
  {names: ['監督賞'], category: '監督賞', role: 'director'},
  {names: ['主演男優賞'], category: '主演男優賞', role: 'actor'},
];

describe('parseListPersonAwardWikitext', () => {
  it('回の見出しの下の部門行から人物と作品を読む', () => {
    const wikitext = `
== 歴代受賞者 ==
==== 第67回（2024年度） ====
* 作品賞 『[[侍タイムスリッパー]]』
* 監督賞  [[入江悠]] 『[[あんのこと]]』
* 主演男優賞 [[山口馬木也]] 『[[侍タイムスリッパー (映画)|侍タイムスリッパー]]』
`;

    expect(parseListPersonAwardWikitext(wikitext, CATEGORIES)).toEqual([
      {
        year: 2024,
        ceremonyNumber: 67,
        entries: [
          {
            category: '監督賞',
            people: [{name: '入江悠', page: '入江悠'}],
            films: [{page: 'あんのこと', title: 'あんのこと'}],
          },
          {
            category: '主演男優賞',
            people: [{name: '山口馬木也', page: '山口馬木也'}],
            films: [
              {page: '侍タイムスリッパー (映画)', title: '侍タイムスリッパー'},
            ],
          },
        ],
      },
    ]);
  });

  it('裸の『作品』は同じ回の『』内リンクから記事名を補う', () => {
    const wikitext = `
==== 第67回（2024年度） ====
* 作品賞 『[[侍タイムスリッパー (映画)|侍タイムスリッパー]]』
* 主演男優賞 [[山口馬木也]] 『侍タイムスリッパー』
`;

    expect(
      parseListPersonAwardWikitext(wikitext, CATEGORIES)[0].entries[0].films,
    ).toEqual([
      {page: '侍タイムスリッパー (映画)', title: '侍タイムスリッパー'},
    ]);
  });

  it('リンクの無い人名はそのまま名前にする', () => {
    const wikitext = `
==== 第10回（1985年度） ====
*監督賞 森田芳光（『[[それから (映画)|それから]]』）
`;

    expect(
      parseListPersonAwardWikitext(wikitext, CATEGORIES)[0].entries[0].people,
    ).toEqual([{name: '森田芳光'}]);
  });

  it('該当者なしの部門は読まない', () => {
    const wikitext = `
==== 第3回（1952年度） ====
*主演男優賞 該当者なし<ref name="allcinema1952"/>
*監督賞 （該当者なし）
`;

    expect(
      parseListPersonAwardWikitext(wikitext, CATEGORIES)[0].entries,
    ).toEqual([]);
  });

  it('副項目に並ぶ複数の受賞者は別々の受賞にする', () => {
    const wikitext = `
==== 第8回（1983年度） ====
*主演男優賞 
** [[倍賞美津子]]（『[[陽暉楼]]』ほか）
** [[永島暎子]]（『[[竜二 (映画)|竜二]]』）
*監督賞 [[森田芳光]]（『[[家族ゲーム]]』）
`;

    expect(
      parseListPersonAwardWikitext(wikitext, CATEGORIES)[0].entries,
    ).toEqual([
      {
        category: '主演男優賞',
        people: [{name: '倍賞美津子', page: '倍賞美津子'}],
        films: [{page: '陽暉楼', title: '陽暉楼'}],
      },
      {
        category: '主演男優賞',
        people: [{name: '永島暎子', page: '永島暎子'}],
        films: [{page: '竜二 (映画)', title: '竜二'}],
      },
      {
        category: '監督賞',
        people: [{name: '森田芳光', page: '森田芳光'}],
        films: [{page: '家族ゲーム', title: '家族ゲーム'}],
      },
    ]);
  });

  it('連名の受賞者は1つの受賞にまとめる', () => {
    const wikitext = `
==== 第61回（1987年度） ====
* 監督賞 [[パオロ・タヴィアーニ]]、[[ヴィットリオ・タヴィアーニ]]（『[[グッドモーニング・バビロン!]]』）
`;

    expect(
      parseListPersonAwardWikitext(wikitext, CATEGORIES)[0].entries,
    ).toEqual([
      {
        category: '監督賞',
        people: [
          {name: 'パオロ・タヴィアーニ', page: 'パオロ・タヴィアーニ'},
          {
            name: 'ヴィットリオ・タヴィアーニ',
            page: 'ヴィットリオ・タヴィアーニ',
          },
        ],
        films: [
          {
            page: 'グッドモーニング・バビロン!',
            title: 'グッドモーニング・バビロン!',
          },
        ],
      },
    ]);
  });

  it('1行に並ぶ複数の「人物 作品」は別々の受賞にする', () => {
    const wikitext = `
==== [[第79回毎日映画コンクール|第79回（2024年）]] ====
:* 俳優部門
:** 主演男優賞 [[河合優実]] 『[[あんのこと]]』『[[ナミビアの砂漠]]』、[[横浜流星]] 『[[正体 (染井為人)#映画|正体]]』
`;

    expect(parseListPersonAwardWikitext(wikitext, CATEGORIES)).toEqual([
      {
        year: 2024,
        ceremonyNumber: 79,
        entries: [
          {
            category: '主演男優賞',
            people: [{name: '河合優実', page: '河合優実'}],
            films: [
              {page: 'あんのこと', title: 'あんのこと'},
              {page: 'ナミビアの砂漠', title: 'ナミビアの砂漠'},
            ],
          },
          {
            category: '主演男優賞',
            people: [{name: '横浜流星', page: '横浜流星'}],
            films: [{page: '正体 (染井為人)', title: '正体'}],
          },
        ],
      },
    ]);
  });

  it('出典の中の『』は作品に数えない', () => {
    const wikitext = `
==== 第67回（2024年度） ====
* 監督賞 [[入江悠]] 『[[あんのこと]]』<ref>{{Cite web|title=入江悠『別の作品』で監督賞}}</ref>
`;

    expect(
      parseListPersonAwardWikitext(wikitext, CATEGORIES)[0].entries[0].films,
    ).toEqual([{page: 'あんのこと', title: 'あんのこと'}]);
  });

  it('改称前の部門名も同じ部門として読む', () => {
    const wikitext = `
==== 第1回（1946年）====
:** 男優演技賞 [[小沢栄太郎]]『[[大曾根家の朝]]』
`;
    const categories: ListPersonAwardCategory[] = [
      {
        names: ['男優主演賞', '男優演技賞'],
        category: '男優主演賞',
        role: 'actor',
      },
    ];

    expect(
      parseListPersonAwardWikitext(wikitext, categories)[0].entries[0].category,
    ).toBe('男優主演賞');
  });

  it('年を限った部門名はその年だけ読む', () => {
    const wikitext = `
==== 第3回（1948年）====
:** 助演賞 [[宇野重吉]]『[[破戒 (小説)#1948年版|破戒]]』
==== 第4回（1949年）====
:** 助演賞 [[木暮実千代]]『[[青い山脈 (映画)#1949年版|青い山脈]]』
`;
    const categories: ListPersonAwardCategory[] = [
      {names: ['助演賞'], category: '男優助演賞', role: 'actor', years: [1948]},
      {names: ['助演賞'], category: '女優助演賞', role: 'actor', years: [1949]},
    ];

    expect(
      parseListPersonAwardWikitext(wikitext, categories).map(edition =>
        edition.entries.map(entry => entry.category),
      ),
    ).toEqual([['男優助演賞'], ['女優助演賞']]);
  });

  it('リンク先の節名に『』が入っていても作品を切り出せる', () => {
    const wikitext = `
==== 第39回（1996年度） ====
*助演女優賞 [[岸田今日子]]『[[学校の怪談 (映画)#『学校の怪談2』（1996年）|学校の怪談2]]』『[[八つ墓村]]』
`;
    const categories: ListPersonAwardCategory[] = [
      {names: ['助演女優賞'], category: '助演女優賞', role: 'actor'},
    ];

    expect(
      parseListPersonAwardWikitext(wikitext, categories)[0].entries[0].films,
    ).toEqual([
      {page: '学校の怪談 (映画)', title: '学校の怪談2'},
      {page: '八つ墓村', title: '八つ墓村'},
    ]);
  });

  it('仮リンクの作品は表示名を題名にする', () => {
    const wikitext = `
==== 第53回（1998年）====
:** 主演男優賞 [[本木雅弘]]『{{仮リンク|中国の鳥人|en|The Bird People in China}}』
`;

    expect(
      parseListPersonAwardWikitext(wikitext, CATEGORIES)[0].entries[0].films,
    ).toEqual([{title: '中国の鳥人'}]);
  });
});

describe('parseListPersonAwardWikitext の受賞者の区切り', () => {
  it('作品の後に裸の人名が続けば別の受賞にする', () => {
    const wikitext = `
==== 第26回（1971年）====
:** 監督賞 [[篠田正浩]]『沈黙 SILENCE』、山田洋次『[[男はつらいよ 純情篇]]』『[[男はつらいよ 奮闘篇]]』
`;

    expect(
      parseListPersonAwardWikitext(wikitext, CATEGORIES)[0].entries,
    ).toEqual([
      {
        category: '監督賞',
        people: [{name: '篠田正浩', page: '篠田正浩'}],
        films: [{title: '沈黙 SILENCE'}],
      },
      {
        category: '監督賞',
        people: [{name: '山田洋次'}],
        films: [
          {page: '男はつらいよ 純情篇', title: '男はつらいよ 純情篇'},
          {page: '男はつらいよ 奮闘篇', title: '男はつらいよ 奮闘篇'},
        ],
      },
    ]);
  });

  it('作品の後の「ほか」「など」は人名にしない', () => {
    const wikitext = `
==== 第8回（1983年度） ====
*主演男優賞 [[倍賞美津子]]（『[[陽暉楼]]』ほか）
*監督賞 [[森田芳光]]（『[[家族ゲーム]]』など）
`;

    expect(
      parseListPersonAwardWikitext(wikitext, CATEGORIES)[0].entries.map(
        entry => entry.people,
      ),
    ).toEqual([
      [{name: '倍賞美津子', page: '倍賞美津子'}],
      [{name: '森田芳光', page: '森田芳光'}],
    ]);
  });

  it('リンク先の曖昧さ回避は名前から外す', () => {
    const wikitext = `
==== 第9回（1958年度） ====
*主演男優賞 [[中村鴈治郎 (2代目)]]『[[炎上 (映画)|炎上]]』
`;

    expect(
      parseListPersonAwardWikitext(wikitext, CATEGORIES)[0].entries[0].people,
    ).toEqual([{name: '中村鴈治郎', page: '中村鴈治郎 (2代目)'}]);
  });
});

const DIRECTOR: ListPersonAwardCategory = {
  names: ['監督賞'],
  category: '監督賞',
  role: 'director',
};

const FOREIGN_DIRECTOR: ListPersonAwardCategory = {
  names: ['外国映画監督賞'],
  category: '外国映画監督賞',
  role: 'director',
  foreign: true,
};

const SOURCE: ListPersonAwardSource = {
  key: 'test-award',
  article: 'テスト賞',
  organizationName: 'Test Awards',
  establishedYear: 1950,
  ceremonyNumber: year => year - 1949,
  categories: [DIRECTOR, FOREIGN_DIRECTOR],
  resolutionOverrides: new Map([['1961:河口', 'tt0055000']]),
  personNameAliases: {北野武: 'ビートたけし'},
};

const EDITIONS: ListPersonAwardEdition[] = [
  {
    year: 1961,
    ceremonyNumber: 12,
    entries: [
      {
        category: '監督賞',
        people: [{name: '北野武', page: '北野武'}],
        films: [
          {page: '座頭市 (2003年の映画)', title: '座頭市'},
          {title: '河口'},
        ],
      },
      {
        category: '外国映画監督賞',
        people: [
          {name: 'パオロ・タヴィアーニ', page: 'パオロ・タヴィアーニ'},
          {
            name: 'ヴィットリオ・タヴィアーニ',
            page: 'ヴィットリオ・タヴィアーニ',
          },
        ],
        films: [
          {
            page: 'グッドモーニング・バビロン!',
            title: 'グッドモーニング・バビロン!',
          },
        ],
      },
    ],
  },
  {
    year: 1962,
    ceremonyNumber: 13,
    entries: [
      {
        category: '監督賞',
        people: [{name: '今井正', page: '今井正'}],
        films: [{page: '座頭市 (2003年の映画)', title: '座頭市'}],
      },
      {
        category: '監督賞',
        people: [{name: '木下惠介'}],
        films: [{title: '楢山節考'}],
      },
    ],
  },
];

const RESOLVED = new Map<string, ResolvedFilm>([
  [
    '座頭市 (2003年の映画)@1961',
    {imdbId: 'tt0363226', englishTitle: 'Zatoichi'},
  ],
  [
    '座頭市 (2003年の映画)@1962',
    {imdbId: 'tt0363226', englishTitle: 'Zatoichi'},
  ],
  [
    'グッドモーニング・バビロン!@1961',
    {imdbId: 'tt0093106', englishTitle: 'Good Morning, Babylon'},
  ],
]);

describe('listPersonAwardFilmReferences', () => {
  it('同じ年度の同じ作品は1件にまとめ、記事の無い作品は題名をキーにする', () => {
    const references = listPersonAwardFilmReferences(SOURCE, EDITIONS);

    expect(references.map(reference => reference.key)).toEqual([
      '座頭市 (2003年の映画)@1961',
      'グッドモーニング・バビロン!@1961',
      '座頭市 (2003年の映画)@1962',
      'title:楢山節考@1962',
    ]);
  });

  it('同じ記事が別の年度に現れたら年度ごとに同定する', () => {
    const references = listPersonAwardFilmReferences(SOURCE, EDITIONS).filter(
      reference => reference.title === '座頭市',
    );

    expect(references.map(reference => reference.targetYear)).toEqual([
      1961, 1962,
    ]);
  });

  it('年度を目標年にし、日本映画は前後1年の窓で同定する', () => {
    const [reference] = listPersonAwardFilmReferences(SOURCE, EDITIONS);

    expect(reference).toMatchObject({
      title: '座頭市',
      targetYear: 1961,
      yearWindow: {min: -1, max: 1},
      foreign: false,
    });
  });

  it('外国映画の部門は過去側に開いた窓で同定する', () => {
    const [, reference] = listPersonAwardFilmReferences(SOURCE, EDITIONS);

    expect(reference).toMatchObject({
      yearWindow: {min: -Infinity, max: 1},
      foreign: true,
    });
  });
});

describe('toImdbEventData', () => {
  it('年度ごとに部門の受賞を人物と作品付きで並べる', () => {
    const data = toImdbEventData(SOURCE, DIRECTOR, EDITIONS, RESOLVED);

    expect(data.source).toBe('https://ja.wikipedia.org/wiki/テスト賞');
    expect(data.editions[0]).toEqual({
      year: 1961,
      awardNames: ['監督賞'],
      targetAward: [
        {
          categories: [
            {
              category: '監督賞',
              total: null,
              nominations: [
                {
                  isWinner: true,
                  notes: null,
                  titles: [
                    {
                      imdbId: 'tt0363226',
                      title: '座頭市',
                      originalTitle: 'Zatoichi',
                    },
                    {imdbId: 'tt0055000', title: '河口', originalTitle: null},
                  ],
                  people: [{name: 'ビートたけし'}],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('他の部門の受賞は含めない', () => {
    const data = toImdbEventData(SOURCE, FOREIGN_DIRECTOR, EDITIONS, RESOLVED);

    expect(data.editions).toHaveLength(1);
    expect(data.editions[0].targetAward[0].categories[0].nominations).toEqual([
      {
        isWinner: true,
        notes: null,
        titles: [
          {
            imdbId: 'tt0093106',
            title: 'グッドモーニング・バビロン!',
            originalTitle: 'Good Morning, Babylon',
          },
        ],
        people: [
          {name: 'パオロ・タヴィアーニ'},
          {name: 'ヴィットリオ・タヴィアーニ'},
        ],
      },
    ]);
  });

  it('同定できない作品しか無い受賞は落とす', () => {
    const data = toImdbEventData(SOURCE, DIRECTOR, EDITIONS, RESOLVED);

    expect(
      data.editions[1].targetAward[0].categories[0].nominations.map(
        nomination => nomination.people,
      ),
    ).toEqual([[{name: '今井正'}]]);
  });

  it('受賞の無い年度は落とす', () => {
    const data = toImdbEventData(SOURCE, DIRECTOR, EDITIONS, new Map());

    expect(data.editions.map(edition => edition.year)).toEqual([1961]);
  });
});

describe('listPersonAwardConfig', () => {
  it('部門名と人物を引き当てるクレジットを設定する', () => {
    const config = listPersonAwardConfig(SOURCE, DIRECTOR);

    expect(config).toMatchObject({
      organizationName: 'Test Awards',
      organizationCountry: 'Japan',
      establishedYear: 1950,
      categoryName: '監督賞',
      personRole: 'director',
      minimumFilmsPerEdition: 1,
    });
    expect(config.ceremonyNumber(1961)).toBe(12);
    expect(config.isCompetitionCategory('監督賞')).toBe(true);
    expect(config.isCompetitionCategory('外国映画監督賞')).toBe(false);
  });
});
