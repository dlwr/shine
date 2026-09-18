import {describe, expect, it} from 'vitest';
import type {ResolvedFilm} from '../wikidata-film-resolver';
import {
  collectAwardLineFilms,
  collectJapaneseTitles,
  filmAwardConfig,
  filmAwardReferences,
  filmKey,
  parseBracketedFilms,
  splitEditions,
  toFilmAwardEventData,
  type FilmAwardSource,
  type WikiFilm,
} from '../ja-wikipedia-film-award';

const EDITION_HEADING = /^====\s*第(\d+)回（(\d{4})年度）\s*====$/m;

type TestEdition = {
  year: number;
  japanese: WikiFilm[];
  foreign: WikiFilm[];
};

const source: FilmAwardSource<TestEdition> = {
  article: '架空映画賞',
  organizationName: 'Test Film Award',
  establishedYear: 1950,
  ceremonyNumber: year => year - 1949,
  categories: [
    {category: '日本映画賞', films: edition => edition.japanese},
    {category: '外国映画賞', films: edition => edition.foreign, foreign: true},
  ],
};

const edition = (
  year: number,
  japanese: WikiFilm[],
  foreign: WikiFilm[] = [],
): TestEdition => ({year, japanese, foreign});

const resolvedMap = (
  entries: Array<[string, ResolvedFilm]>,
): Map<string, ResolvedFilm> => new Map(entries);

describe('splitEditions', () => {
  it('見出しの回次と年で本文を分ける', () => {
    const wikitext = [
      '==== 第75回（2023年度）====',
      '* 日本映画『怪物』',
      '==== 第76回（2024年度）====',
      '* 日本映画『侍タイムスリッパー』',
    ].join('\n');

    expect(splitEditions(wikitext, EDITION_HEADING)).toEqual([
      {ceremonyNumber: 75, year: 2023, body: '\n* 日本映画『怪物』\n'},
      {
        ceremonyNumber: 76,
        year: 2024,
        body: '\n* 日本映画『侍タイムスリッパー』',
      },
    ]);
  });

  it('上位の見出しが来たら本文を打ち切る', () => {
    const wikitext = [
      '==== 第75回（2023年度）====',
      '* 日本映画『怪物』',
      '== 脚注 ==',
      '* 参考文献',
    ].join('\n');

    const [section] = splitEditions(wikitext, EDITION_HEADING);

    expect(section.body).not.toContain('参考文献');
  });

  it('見出しが無ければ何も返さない', () => {
    expect(splitEditions('* 日本映画『怪物』', EDITION_HEADING)).toEqual([]);
  });
});

describe('parseBracketedFilms', () => {
  it('『』の中の記事リンクから記事名と題名を取る', () => {
    expect(parseBracketedFilms('『[[怪物 (2023年の映画)|怪物]]』')).toEqual([
      {page: '怪物 (2023年の映画)', title: '怪物'},
    ]);
  });

  it('表示名の指定が無ければ記事名を題名にする', () => {
    expect(parseBracketedFilms('『[[侍タイムスリッパー]]』')).toEqual([
      {page: '侍タイムスリッパー', title: '侍タイムスリッパー'},
    ]);
  });

  it('記事が無い作品は題名だけを返す', () => {
    expect(parseBracketedFilms('『幻の映画』')).toEqual([{title: '幻の映画'}]);
  });

  it('1行に複数の『』があれば全部返す', () => {
    expect(parseBracketedFilms('『怪物』『PERFECT DAYS』')).toEqual([
      {title: '怪物'},
      {title: 'PERFECT DAYS'},
    ]);
  });

  it('空の『』は飛ばす', () => {
    expect(parseBracketedFilms('『』『怪物』')).toEqual([{title: '怪物'}]);
  });

  it('『』が無くても裸の記事リンクなら拾う', () => {
    expect(parseBracketedFilms('[[怪物 (2023年の映画)|怪物]]')).toEqual([
      {page: '怪物 (2023年の映画)', title: '怪物'},
    ]);
  });

  it('題名に混ざったテンプレートを落とす', () => {
    expect(parseBracketedFilms('『怪物{{Refnest|注}}』')).toEqual([
      {title: '怪物'},
    ]);
  });
});

describe('collectAwardLineFilms', () => {
  it('賞名ごとに作品を振り分ける', () => {
    const body = ['* 作品賞 『怪物』', '* 監督賞 『PERFECT DAYS』'].join('\n');
    const best: WikiFilm[] = [];
    const director: WikiFilm[] = [];

    collectAwardLineFilms(body, name =>
      name === '作品賞' ? best : name === '監督賞' ? director : undefined,
    );

    expect(best).toEqual([{title: '怪物'}]);
    expect(director).toEqual([{title: 'PERFECT DAYS'}]);
  });

  it('入れ子の行は賞の行として扱わない', () => {
    const body = ['* 作品賞 『怪物』', '** 備考 『別の映画』'].join('\n');
    const best: WikiFilm[] = [];

    collectAwardLineFilms(body, () => best);

    expect(best).toEqual([{title: '怪物'}]);
  });

  it('出典に入った題名に釣られない', () => {
    const body = '* 作品賞 『怪物』<ref>「『別の映画』を推す」</ref>';
    const best: WikiFilm[] = [];

    collectAwardLineFilms(body, () => best);

    expect(best).toEqual([{title: '怪物'}]);
  });

  it('引き取り先の無い賞名は捨てる', () => {
    const body = '* 特別賞 『怪物』';
    const best: WikiFilm[] = [];

    collectAwardLineFilms(body, name => (name === '作品賞' ? best : undefined));

    expect(best).toEqual([]);
  });
});

describe('filmKey', () => {
  it('記事があれば記事名で引く', () => {
    expect(filmKey({page: '怪物 (2023年の映画)', title: '怪物'})).toBe(
      '怪物 (2023年の映画)',
    );
  });

  it('記事が無ければ題名で引く', () => {
    expect(filmKey({title: '幻の映画'})).toBe('title:幻の映画');
  });
});

describe('filmAwardReferences', () => {
  it('日本映画は前後1年を同定の窓にする', () => {
    const [reference] = filmAwardReferences(source, [
      edition(2023, [{title: '怪物'}]),
    ]);

    expect(reference).toEqual({
      key: 'title:怪物',
      title: '怪物',
      targetYear: 2023,
      yearWindow: {min: -1, max: 1},
      foreign: false,
    });
  });

  it('外国映画は日本公開の遅れを見込んで窓の下限を外す', () => {
    const [reference] = filmAwardReferences(source, [
      edition(2023, [], [{title: 'オッペンハイマー'}]),
    ]);

    expect(reference.yearWindow).toEqual({min: -Infinity, max: 1});
    expect(reference.foreign).toBe(true);
  });

  it('IMDb ID を直に指した作品は同定にかけない', () => {
    const references = filmAwardReferences(
      {...source, resolutionOverrides: new Map([['2023:怪物', 'tt10574236']])},
      [edition(2023, [{title: '怪物'}, {title: 'PERFECT DAYS'}])],
    );

    expect(references.map(reference => reference.title)).toEqual([
      'PERFECT DAYS',
    ]);
  });
});

describe('toFilmAwardEventData', () => {
  const resolved = resolvedMap([
    ['title:怪物', {imdbId: 'tt10574236', englishTitle: 'Monster'}],
  ]);

  it('同定できた作品だけをノミネートにする', () => {
    const data = toFilmAwardEventData(
      source,
      [edition(2023, [{title: '怪物'}, {title: '同定できない映画'}])],
      resolved,
      '2026-09-18',
    );

    expect(data.editions[0].targetAward[0].categories[0].nominations).toEqual([
      {
        isWinner: true,
        notes: null,
        titles: [
          {imdbId: 'tt10574236', title: '怪物', originalTitle: 'Monster'},
        ],
      },
    ]);
  });

  it('同じ作品が二度出てきたら一度だけ数える', () => {
    const data = toFilmAwardEventData(
      source,
      [edition(2023, [{title: '怪物'}, {page: '怪物', title: '怪物'}])],
      resolvedMap([
        ['title:怪物', {imdbId: 'tt10574236'}],
        ['怪物', {imdbId: 'tt10574236'}],
      ]),
      '2026-09-18',
    );

    expect(
      data.editions[0].targetAward[0].categories[0].nominations,
    ).toHaveLength(1);
  });

  it('ノミネートが1件も無い回は落とす', () => {
    const data = toFilmAwardEventData(
      source,
      [
        edition(2022, [{title: '同定できない映画'}]),
        edition(2023, [{title: '怪物'}]),
      ],
      resolved,
      '2026-09-18',
    );

    expect(data.editions.map(item => item.year)).toEqual([2023]);
  });

  it('部門が受賞の判定を持てば従う', () => {
    const ranked: FilmAwardSource<TestEdition> = {
      ...source,
      categories: [
        {
          category: '日本映画ベストテン',
          films: item => item.japanese,
          nomination: film => ({
            isWinner: film.title === '怪物',
            notes: '1位',
          }),
        },
      ],
    };

    const data = toFilmAwardEventData(
      ranked,
      [edition(2023, [{title: '怪物'}])],
      resolved,
      '2026-09-18',
    );

    expect(
      data.editions[0].targetAward[0].categories[0].nominations[0],
    ).toMatchObject({isWinner: true, notes: '1位'});
  });

  it('出典に日本語版 Wikipedia の記事の URL を入れる', () => {
    const data = toFilmAwardEventData(
      {...source, article: '日本アカデミー賞 作品賞'},
      [edition(2023, [{title: '怪物'}])],
      resolved,
      '2026-09-18',
    );

    expect(data.source).toBe(
      'https://ja.wikipedia.org/wiki/日本アカデミー賞_作品賞',
    );
  });
});

describe('filmAwardConfig', () => {
  it('部門名から取り込みの設定を組み立てる', () => {
    expect(filmAwardConfig(source, '日本映画賞')).toMatchObject({
      organizationName: 'Test Film Award',
      organizationCountry: 'Japan',
      establishedYear: 1950,
      categoryName: '日本映画賞',
    });
  });

  it('定義に無い部門を指したら投げる', () => {
    expect(() => filmAwardConfig(source, '存在しない賞')).toThrow(
      '架空映画賞に部門「存在しない賞」は無い',
    );
  });
});

describe('collectJapaneseTitles', () => {
  it('同定できた作品の邦題を IMDb ID に結びつける', () => {
    const titles = collectJapaneseTitles(
      source,
      [edition(2023, [{title: '怪物'}])],
      resolvedMap([['title:怪物', {imdbId: 'tt10574236'}]]),
    );

    expect(titles.get('tt10574236')).toBe('怪物');
  });

  it('日本語を含まない題名は邦題として扱わない', () => {
    const titles = collectJapaneseTitles(
      source,
      [edition(2023, [{title: 'PERFECT DAYS'}])],
      resolvedMap([['title:PERFECT DAYS', {imdbId: 'tt27503384'}]]),
    );

    expect(titles.size).toBe(0);
  });

  it('同定できていない作品は数に入れない', () => {
    const titles = collectJapaneseTitles(
      source,
      [edition(2023, [{title: '怪物'}])],
      resolvedMap([]),
    );

    expect(titles.size).toBe(0);
  });
});
