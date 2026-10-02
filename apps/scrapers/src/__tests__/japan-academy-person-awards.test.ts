import {describe, expect, it} from 'vitest';
import {
  listPersonAwardConfig,
  listPersonAwardFilmReferences,
  toImdbEventData,
  type ListPersonAwardEdition,
} from '../common/ja-wikipedia-person-award';
import {
  japanAcademyPersonSource,
  type JapanAcademyPersonAward,
} from '../japan-academy-person-awards';
import type {ResolvedFilm} from '../common/wikidata-film-resolver';

const AWARD: JapanAcademyPersonAward = {
  article: '日本アカデミー賞助演男優賞',
  category: '助演男優賞',
  role: 'actor',
};

const SOURCE = japanAcademyPersonSource(AWARD);
const [CATEGORY] = SOURCE.categories;

function edition(
  year: number,
  personName: string,
  film: {page?: string; title: string},
): ListPersonAwardEdition {
  return {
    year,
    ceremonyNumber: year - 1976,
    entries: [
      {
        category: AWARD.category,
        people: [{name: personName}],
        films: [film],
        isWinner: false,
      },
    ],
  };
}

const KOKUHO = edition(2025, '横浜流星', {page: '国宝 (小説)', title: '国宝'});

const RESOLVED = new Map<string, ResolvedFilm>([
  ['国宝 (小説)@2025', {imdbId: 'tt22222222', englishTitle: 'Kokuho'}],
]);

describe('japanAcademyPersonSource', () => {
  it('対象作品の公開年を目標年にする', () => {
    const [reference] = listPersonAwardFilmReferences(SOURCE, [KOKUHO]);

    expect(reference.targetYear).toBe(2025);
  });

  it('授賞式の年に変換する', () => {
    const data = toImdbEventData(SOURCE, CATEGORY, [KOKUHO], RESOLVED);

    expect(data.editions[0].year).toBe(2026);
  });

  it('芸名が違う人物は別名に置き換える', () => {
    const data = toImdbEventData(
      SOURCE,
      CATEGORY,
      [edition(1997, '北野武', {page: 'HANA-BI', title: 'HANA-BI'})],
      new Map([['HANA-BI@1997', {imdbId: 'tt0119250'}]]),
    );

    expect(
      data.editions[0].targetAward[0].categories[0].nominations[0].people?.[0]
        .name,
    ).toBe('ビートたけし');
  });

  it('直指定した作品はWikidataで引けなくても取り込む', () => {
    const data = toImdbEventData(
      SOURCE,
      CATEGORY,
      [edition(2011, '井上真央', {page: '八日目の蝉', title: '八日目の蝉'})],
      new Map(),
    );

    expect(
      data.editions[0].targetAward[0].categories[0].nominations[0].titles[0]
        .imdbId,
    ).toBe('tt1727825');
  });

  it('直指定した作品は参照に含めない', () => {
    const references = listPersonAwardFilmReferences(SOURCE, [
      edition(2011, '井上真央', {page: '八日目の蝉', title: '八日目の蝉'}),
    ]);

    expect(references).toEqual([]);
  });

  it('回次は授賞式の年から1977を引く', () => {
    expect(listPersonAwardConfig(SOURCE, CATEGORY).ceremonyNumber(2026)).toBe(
      49,
    );
  });

  it('監督賞は監督クレジットから人物を引き当てる', () => {
    const source = japanAcademyPersonSource({
      article: '日本アカデミー賞監督賞',
      category: '監督賞',
      role: 'director',
    });

    expect(listPersonAwardConfig(source, source.categories[0]).personRole).toBe(
      'director',
    );
  });
});
