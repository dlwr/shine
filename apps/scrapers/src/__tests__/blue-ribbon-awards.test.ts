import {describe, expect, it} from 'vitest';
import {
  BEST_FILM_CATEGORY,
  FOREIGN_CATEGORY,
  blueRibbonCeremonyNumber,
  blueRibbonFilmReferences,
  parseBlueRibbonWikitext,
  toImdbEventData,
} from '../blue-ribbon-awards';

const sampleWikitext = `== 沿革 ==
本文。

== 歴代各賞 ==
=== 第1回（1950年度） - 第10回（1959年度） ===
==== 第1回（1950年度） ====
*日本映画文化賞 [[松竹]] [[富士写真フイルム]]（長編天然色劇映画『[[カルメン故郷に帰る]]』の製作）<ref name="award1950"/>
*作品賞『[[また逢う日まで (1950年の映画)|また逢う日まで]]』<ref name="award1950"/>
*監督賞 [[今井正]]『また逢う日まで』<ref name="award1950"/>
*演技賞
** [[山村聰|山村聡]]『[[宗方姉妹]]』ほか<ref name="award1950"/>

==== 第2回（1951年度） ====
*作品賞『[[めし]]』<ref name="nenkan1953" />
*海外映画賞『[[サンセット大通り (映画)|サンセット大通り]]』（[[アメリカ合衆国|アメリカ]]）<ref name="nenkan1953" />

==== 第3回（1952年度） ====
*作品賞『[[稲妻 (映画)|稲妻]]』
*主演男優賞 該当者なし
*外国作品賞『[[チャップリンの殺人狂時代]]』（[[アメリカ合衆国|アメリカ]]）

=== 第51回（2008年度） - 第60回（2017年度） ===
==== 第56回（2013年度） ====
*作品賞『[[横道世之介#映画|横道世之介]]』<ref name="nikkan2014123" />
*助演男優賞 [[ピエール瀧]] 『[[凶悪 (映画)|凶悪]]』『[[くじけないで]]』
*特別賞 [[大島渚]]、[[三國連太郎]]
*外国作品賞 『[[ゼロ・グラビティ (映画)|ゼロ・グラビティ]]』（[[アメリカ合衆国]]）

==== 第59回（2016年度） ====
*作品賞 『[[シン・ゴジラ]]』<ref>{{Cite web|和書|title= 『シン・ゴジラ』作品賞！『君の名は。』特別賞！第59回ブルーリボン賞決定 }}</ref>
*特別賞 『[[君の名は。]]』

==== 第68回（2025年度） ====
* 作品賞 『[[国宝 (映画)|国宝]]』<ref>出典</ref>
* 新人賞 [[渋谷龍太]] 『ナイトフラワー』
* 外国作品賞 『[[教皇選挙 (映画)|教皇選挙]]』

== 脚注 ==
*作品賞『[[脚注の作品]]』
`;

describe('blueRibbonCeremonyNumber', () => {
  it('第1回は1950年度', () => {
    expect(blueRibbonCeremonyNumber(1950)).toBe(1);
  });

  it('休止前の最終回は第17回（1966年度）', () => {
    expect(blueRibbonCeremonyNumber(1966)).toBe(17);
  });

  it('休止期間は回次を持たない', () => {
    expect(blueRibbonCeremonyNumber(1967)).toBeUndefined();
    expect(blueRibbonCeremonyNumber(1974)).toBeUndefined();
  });

  it('再開後の第18回は1975年度', () => {
    expect(blueRibbonCeremonyNumber(1975)).toBe(18);
  });

  it('2025年度は第68回', () => {
    expect(blueRibbonCeremonyNumber(2025)).toBe(68);
  });

  it('第1回より前は回次を持たない', () => {
    expect(blueRibbonCeremonyNumber(1949)).toBeUndefined();
  });
});

describe('parseBlueRibbonWikitext', () => {
  const editions = parseBlueRibbonWikitext(sampleWikitext);
  const editionOf = (year: number) =>
    editions.find(edition => edition.year === year);

  it('回ごとに分割する', () => {
    expect(editions.map(edition => edition.year)).toEqual([
      1950, 1951, 1952, 2013, 2016, 2025,
    ]);
  });

  it('作品賞を取り込む', () => {
    expect(editionOf(1950)?.bestFilm).toEqual([
      {page: 'また逢う日まで (1950年の映画)', title: 'また逢う日まで'},
    ]);
  });

  it('作品以外の賞を取り込まない', () => {
    const titles = editions.flatMap(edition => [
      ...edition.bestFilm,
      ...edition.foreign,
    ]);
    expect(titles.map(film => film.title)).not.toContain('カルメン故郷に帰る');
    expect(titles.map(film => film.title)).not.toContain('宗方姉妹');
    expect(titles.map(film => film.title)).not.toContain('凶悪');
    expect(titles.map(film => film.title)).not.toContain('ナイトフラワー');
  });

  it('外国作品賞を取り込む', () => {
    expect(editionOf(1952)?.foreign).toEqual([
      {page: 'チャップリンの殺人狂時代', title: 'チャップリンの殺人狂時代'},
    ]);
  });

  it('旧称の海外映画賞を外国作品賞として取り込む', () => {
    expect(editionOf(1951)?.foreign).toEqual([
      {page: 'サンセット大通り (映画)', title: 'サンセット大通り'},
    ]);
  });

  it('外国作品賞が無い回は空になる', () => {
    expect(editionOf(1950)?.foreign).toEqual([]);
  });

  it('賞名と題名の間に空白がある行を取り込む', () => {
    expect(editionOf(2025)?.bestFilm).toEqual([
      {page: '国宝 (映画)', title: '国宝'},
    ]);
    expect(editionOf(2025)?.foreign).toEqual([
      {page: '教皇選挙 (映画)', title: '教皇選挙'},
    ]);
  });

  it('出典の中の題名を取り込まない', () => {
    expect(editionOf(2016)?.bestFilm).toEqual([
      {page: 'シン・ゴジラ', title: 'シン・ゴジラ'},
    ]);
  });

  it('セクションアンカー付きのリンクから記事名を取り出す', () => {
    expect(editionOf(2013)?.bestFilm).toEqual([
      {page: '横道世之介', title: '横道世之介'},
    ]);
  });

  it('歴代各賞より後のセクションを取り込まない', () => {
    const titles = editions.flatMap(edition => edition.bestFilm);
    expect(titles.map(film => film.title)).not.toContain('脚注の作品');
  });
});

describe('blueRibbonFilmReferences', () => {
  const editions = parseBlueRibbonWikitext(sampleWikitext);
  const references = blueRibbonFilmReferences(editions);

  it('日本映画は前後1年の窓を持つ', () => {
    const reference = references.find(entry => entry.title === '国宝');
    expect(reference?.targetYear).toBe(2025);
    expect(reference?.yearWindow).toEqual({min: -1, max: 1});
    expect(reference?.foreign).toBe(false);
  });

  it('外国映画は年度より前の公開を許容する', () => {
    const reference = references.find(entry => entry.title === '教皇選挙');
    expect(reference?.yearWindow).toEqual({min: -Infinity, max: 1});
    expect(reference?.foreign).toBe(true);
  });
});

describe('toImdbEventData', () => {
  const editions = parseBlueRibbonWikitext(sampleWikitext);
  const resolved = new Map([
    ['国宝 (映画)', {imdbId: 'tt32600617', englishTitle: 'Kokuho'}],
    ['教皇選挙 (映画)', {imdbId: 'tt20215234', englishTitle: 'Conclave'}],
  ]);
  const data = toImdbEventData(editions, resolved);
  const categoryOf = (year: number, name: string) =>
    data.editions
      .find(edition => edition.year === year)
      ?.targetAward[0].categories.find(category => category.category === name);

  it('作品賞を受賞として取り込む', () => {
    const nominations = categoryOf(2025, BEST_FILM_CATEGORY)?.nominations;
    expect(nominations).toHaveLength(1);
    expect(nominations?.[0].isWinner).toBe(true);
  });

  it('外国作品賞を受賞として取り込む', () => {
    const nominations = categoryOf(2025, FOREIGN_CATEGORY)?.nominations;
    expect(nominations?.[0].isWinner).toBe(true);
  });

  it('Wikidataの英語ラベルを原題として持つ', () => {
    expect(
      categoryOf(2025, BEST_FILM_CATEGORY)?.nominations[0].titles[0],
    ).toEqual({
      imdbId: 'tt32600617',
      title: '国宝',
      originalTitle: 'Kokuho',
    });
  });

  it('解決できた作品が無い回を取り込まない', () => {
    expect(
      data.editions.find(edition => edition.year === 1950),
    ).toBeUndefined();
  });
});
