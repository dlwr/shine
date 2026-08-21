import {describe, expect, it} from 'vitest';
import {
  BEST_FILM_CATEGORY,
  FOREIGN_CATEGORY,
  hochiCeremonyNumber,
  hochiFilmReferences,
  parseHochiWikitext,
  toImdbEventData,
} from '../hochi-film-awards';

const sampleWikitext = `== 概要 ==
本文。

== 歴代各賞 ==
=== 第1回（1976年度） - 第10回（1985年度） ===
==== 第1回（1976年度） ====
*作品賞 『[[犬神家の一族 (1976年の映画)|犬神家の一族]]』（[[市川崑]]）<ref name="h_award1976">{{Cite web|和書|title=報知映画賞ヒストリー(1976)『別の映画』}}</ref>
*主演男優賞 [[藤竜也]]（『[[愛のコリーダ]]』）<ref name="h_award1976"/>
*作品賞・海外部門 『[[タクシードライバー (1976年の映画)|タクシードライバー]]』（[[マーティン・スコセッシ]]）<ref name="h_award1976"/>

=== 第31回（2006年度） - 第40回（2015年度） ===
==== 第33回（2008年度） ====
*作品賞 『[[おくりびと]]』（[[滝田洋二郎]]）
*助演男優賞 [[堺雅人]]（『[[アフタースクール (映画)|アフタースクール]]』）
*作品賞・海外部門 [[ダークナイト]]（[[クリストファー・ノーラン]]）

==== 第49回（2024年度） ====
*作品賞 『[[正体 (染井為人)#映画|正体]]』（[[藤井道人]]）
*新人賞
**[[越山敬達]]（『[[ぼくのお日さま]]』）
*作品賞・海外部門 『[[シビル・ウォー アメリカ最後の日]]』（[[アレックス・ガーランド]]）
*アニメ作品賞 『[[ルックバック#劇場アニメ|ルックバック]]』（[[押山清高]]）

==== 第50回（2025年度） ====
*作品賞 『[[国宝 (映画)|国宝]]』（[[李相日]]）
*作品賞・海外部門 『[[エミリア・ペレス]]』（[[ジャック・オーディアール]]）
*BS10プレミアム賞 『国宝』（李相日）

== 脚注 ==
*作品賞 『[[脚注の作品]]』
`;

describe('hochiCeremonyNumber', () => {
  it('第1回は1976年度', () => {
    expect(hochiCeremonyNumber(1976)).toBe(1);
  });

  it('2025年度は第50回', () => {
    expect(hochiCeremonyNumber(2025)).toBe(50);
  });

  it('第1回より前は回次を持たない', () => {
    expect(hochiCeremonyNumber(1975)).toBeUndefined();
  });
});

describe('parseHochiWikitext', () => {
  const editions = parseHochiWikitext(sampleWikitext);
  const editionOf = (year: number) =>
    editions.find(edition => edition.year === year);

  it('回ごとに分割する', () => {
    expect(editions.map(edition => edition.year)).toEqual([
      1976, 2008, 2024, 2025,
    ]);
  });

  it('作品賞を取り込む', () => {
    expect(editionOf(1976)?.bestFilm).toEqual([
      {page: '犬神家の一族 (1976年の映画)', title: '犬神家の一族'},
    ]);
  });

  it('作品賞・海外部門を取り込む', () => {
    expect(editionOf(1976)?.foreign).toEqual([
      {page: 'タクシードライバー (1976年の映画)', title: 'タクシードライバー'},
    ]);
  });

  it('作品以外の賞を取り込まない', () => {
    const titles = editions.flatMap(edition => [
      ...edition.bestFilm,
      ...edition.foreign,
    ]);
    expect(titles.map(film => film.title)).not.toContain('愛のコリーダ');
    expect(titles.map(film => film.title)).not.toContain('アフタースクール');
    expect(titles.map(film => film.title)).not.toContain('ぼくのお日さま');
    expect(titles.map(film => film.title)).not.toContain('ルックバック');
  });

  it('出典の中の題名を取り込まない', () => {
    const titles = editions.flatMap(edition => edition.bestFilm);
    expect(titles.map(film => film.title)).not.toContain('別の映画');
  });

  it('『』の無い裸リンクの題名を取り込む', () => {
    expect(editionOf(2008)?.foreign).toEqual([
      {page: 'ダークナイト', title: 'ダークナイト'},
    ]);
  });

  it('セクションアンカー付きのリンクから記事名を取り出す', () => {
    expect(editionOf(2024)?.bestFilm).toEqual([
      {page: '正体 (染井為人)', title: '正体'},
    ]);
  });

  it('歴代各賞より後のセクションを取り込まない', () => {
    const titles = editions.flatMap(edition => edition.bestFilm);
    expect(titles.map(film => film.title)).not.toContain('脚注の作品');
  });
});

describe('hochiFilmReferences', () => {
  const editions = parseHochiWikitext(sampleWikitext);
  const references = hochiFilmReferences(editions);

  it('日本映画は前後1年の窓を持つ', () => {
    const reference = references.find(entry => entry.title === '国宝');
    expect(reference?.targetYear).toBe(2025);
    expect(reference?.yearWindow).toEqual({min: -1, max: 1});
    expect(reference?.foreign).toBe(false);
  });

  it('外国映画は年度より前の公開を許容する', () => {
    const reference = references.find(
      entry => entry.title === 'エミリア・ペレス',
    );
    expect(reference?.yearWindow).toEqual({min: -Infinity, max: 1});
    expect(reference?.foreign).toBe(true);
  });
});

describe('toImdbEventData', () => {
  const editions = parseHochiWikitext(sampleWikitext);
  const resolved = new Map([
    ['国宝 (映画)', {imdbId: 'tt32600617', englishTitle: 'Kokuho'}],
    ['エミリア・ペレス', {imdbId: 'tt20221436', englishTitle: 'Emilia Pérez'}],
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

  it('作品賞・海外部門を受賞として取り込む', () => {
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
      data.editions.find(edition => edition.year === 1976),
    ).toBeUndefined();
  });
});
