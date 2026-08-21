import {describe, expect, it} from 'vitest';
import {extractAwardEditions} from '../imdb-event-award';
import {
  EXCELLENCE_CATEGORY,
  FOREIGN_CATEGORY,
  GRAND_PRIX_CATEGORY,
  mainichiCeremonyNumber,
  mainichiFilmReferences,
  mainichiGrandPrixConfig,
  parseMainichiWikitext,
  toImdbEventData,
} from '../mainichi-film-concours';

const sampleWikitext = `== 概要 ==
本文。

== 歴代各賞 ==
=== 1940年代 ===
==== 第1回（1946年）====
:* 作品部門
:** 日本映画賞 『[[或る夜の殿様]]』[[衣笠貞之助]]
:** 大衆賞 『或る夜の殿様』衣笠貞之助
:* 俳優部門
:** 演技賞 [[小沢栄太郎]]『[[大曾根家の朝]]』

=== 1950年代 ===
==== 第6回（1951年）====
:* 作品部門
:** 日本映画賞 『[[めし#映画|めし]]』[[成瀬巳喜男]]、『[[麦秋 (1951年の映画)|麦秋]]』[[小津安二郎]]
:** 教育文化映画賞 『こんこん鳥物語』

=== 1970年代 ===
==== 第31回（1976年）====
:* 作品部門
:** 日本映画大賞 『[[不毛地帯#映画版|不毛地帯]]』[[山本薩夫]]
:** 日本映画優秀賞
:***『[[青春の殺人者]]』[[長谷川和彦]]
:***『[[男はつらいよ 寅次郎夕焼け小焼け]]』[[山田洋次]]
:** 大藤信郎賞 『道成寺』[[川本喜八郎]]
:*** 安珍清姫の話を『今昔物語』などを参考にして脚色した作品。
:** 日本映画ファン賞 『[[犬神家の一族 (1976年の映画)|犬神家の一族]]』
:* スタッフ部門
:** 監督賞 [[山本薩夫]]『不毛地帯』

=== 1980年代 ===
==== 第39回（1984年）====
:* 作品部門
:** 日本映画大賞 『[[お葬式]]』[[伊丹十三]]
:** 日本映画優秀賞
:***『瀬戸内少年野球団』
:** 外国映画ベストワン賞 『[[ワンス・アポン・ア・タイム・イン・アメリカ]]』[[セルジオ・レオーネ]]

=== 2000年代 ===
==== 第59回（2004年）====
:* 作品部門
:** 日本映画大賞 『[[血と骨]]』[[崔洋一]]
:** 日本映画優秀賞 『[[誰も知らない]]』[[是枝裕和]]
:** 外国映画ベストワン賞 『[[ミスティック・リバー]]』

=== 2020年代 ===
==== [[第79回毎日映画コンクール|第79回（2024年）]] ====
:* 作品部門<ref>出典</ref>
:** 日本映画大賞 『[[夜明けのすべて#映画|夜明けのすべて]]』[[三宅唱]]
:** 外国映画ベストワン賞 『[[オッペンハイマー (映画)|オッペンハイマー]]』[[クリストファー・ノーラン]]
:* TSUTAYA DISCAS映画ファン賞
:** 日本映画部門 『夜明けのすべて』
:** 外国映画部門 『[[インサイド・ヘッド2]]』

== 脚注 ==
:** 日本映画大賞 『[[脚注の作品]]』
`;

describe('mainichiCeremonyNumber', () => {
  it('第1回は1946年', () => {
    expect(mainichiCeremonyNumber(1946)).toBe(1);
  });

  it('2025年は第80回', () => {
    expect(mainichiCeremonyNumber(2025)).toBe(80);
  });

  it('第1回より前は回次を持たない', () => {
    expect(mainichiCeremonyNumber(1945)).toBeUndefined();
  });
});

describe('parseMainichiWikitext', () => {
  const editions = parseMainichiWikitext(sampleWikitext);
  const editionOf = (year: number) =>
    editions.find(edition => edition.year === year);

  it('回ごとに分割する', () => {
    expect(editions.map(edition => edition.year)).toEqual([
      1946, 1951, 1976, 1984, 2004, 2024,
    ]);
  });

  it('旧称の日本映画賞を大賞として取り込む', () => {
    expect(editionOf(1946)?.grandPrix).toEqual([
      {page: '或る夜の殿様', title: '或る夜の殿様'},
    ]);
  });

  it('大衆賞や俳優部門を取り込まない', () => {
    const titles = editions.flatMap(edition => [
      ...edition.grandPrix,
      ...edition.excellence,
      ...edition.foreign,
    ]);
    expect(titles.map(film => film.title)).not.toContain('大曾根家の朝');
    expect(editionOf(1946)?.grandPrix).toHaveLength(1);
  });

  it('同時受賞を1行から取り込む', () => {
    expect(editionOf(1951)?.grandPrix).toEqual([
      {page: 'めし', title: 'めし'},
      {page: '麦秋 (1951年の映画)', title: '麦秋'},
    ]);
  });

  it('セクションアンカー付きのリンクから記事名を取り出す', () => {
    expect(editionOf(1976)?.grandPrix).toEqual([
      {page: '不毛地帯', title: '不毛地帯'},
    ]);
  });

  it('優秀賞のサブ項目を取り込む', () => {
    expect(editionOf(1976)?.excellence.map(film => film.title)).toEqual([
      '青春の殺人者',
      '男はつらいよ 寅次郎夕焼け小焼け',
    ]);
  });

  it('優秀賞が同一行に書かれる回を取り込む', () => {
    expect(editionOf(2004)?.excellence).toEqual([
      {page: '誰も知らない', title: '誰も知らない'},
    ]);
  });

  it('記事が存在しない作品は記事名を持たない', () => {
    expect(editionOf(1984)?.excellence).toEqual([{title: '瀬戸内少年野球団'}]);
  });

  it('優秀賞以外のサブ項目を取り込まない', () => {
    const titles = editionOf(1976)?.excellence.map(film => film.title);
    expect(titles).not.toContain('今昔物語');
  });

  it('外国映画ベストワン賞を取り込む', () => {
    expect(editionOf(1984)?.foreign).toEqual([
      {
        page: 'ワンス・アポン・ア・タイム・イン・アメリカ',
        title: 'ワンス・アポン・ア・タイム・イン・アメリカ',
      },
    ]);
  });

  it('外国映画ベストワン賞が無い回は空になる', () => {
    expect(editionOf(1946)?.foreign).toEqual([]);
  });

  it('ファン賞を取り込まない', () => {
    const titles = editions.flatMap(edition => [
      ...edition.grandPrix,
      ...edition.excellence,
      ...edition.foreign,
    ]);
    expect(titles.map(film => film.title)).not.toContain('犬神家の一族');
    expect(titles.map(film => film.title)).not.toContain('インサイド・ヘッド2');
  });

  it('リンク付きの見出しを解釈する', () => {
    expect(editionOf(2024)?.grandPrix).toEqual([
      {page: '夜明けのすべて', title: '夜明けのすべて'},
    ]);
  });

  it('歴代各賞より後のセクションを取り込まない', () => {
    const titles = editions.flatMap(edition => edition.grandPrix);
    expect(titles.map(film => film.title)).not.toContain('脚注の作品');
  });
});

describe('mainichiFilmReferences', () => {
  const editions = parseMainichiWikitext(sampleWikitext);
  const references = mainichiFilmReferences(editions);

  it('日本映画は前後1年の窓を持つ', () => {
    const reference = references.find(entry => entry.title === '血と骨');
    expect(reference?.targetYear).toBe(2004);
    expect(reference?.yearWindow).toEqual({min: -1, max: 1});
    expect(reference?.foreign).toBe(false);
  });

  it('外国映画は年度より前の公開を許容する', () => {
    const reference = references.find(
      entry => entry.title === 'ミスティック・リバー',
    );
    expect(reference?.yearWindow).toEqual({min: -Infinity, max: 1});
    expect(reference?.foreign).toBe(true);
  });
});

describe('toImdbEventData', () => {
  const editions = parseMainichiWikitext(sampleWikitext);
  const resolved = new Map([
    ['血と骨', {imdbId: 'tt0427312', englishTitle: 'Blood and Bones'}],
    ['誰も知らない', {imdbId: 'tt0408664', englishTitle: 'Nobody Knows'}],
    ['ミスティック・リバー', {imdbId: 'tt0327056'}],
  ]);
  const data = toImdbEventData(editions, resolved);
  const editionOf = (year: number) =>
    data.editions.find(edition => edition.year === year);
  const categoryOf = (year: number, name: string) =>
    editionOf(year)?.targetAward[0].categories.find(
      category => category.category === name,
    );

  it('大賞を受賞として取り込む', () => {
    const nominations = categoryOf(2004, GRAND_PRIX_CATEGORY)?.nominations;
    expect(nominations).toHaveLength(1);
    expect(nominations?.[0].isWinner).toBe(true);
  });

  it('優秀賞をノミネートとして取り込む', () => {
    const nominations = categoryOf(2004, EXCELLENCE_CATEGORY)?.nominations;
    expect(nominations?.[0].isWinner).toBe(false);
  });

  it('外国映画ベストワン賞を受賞として取り込む', () => {
    const nominations = categoryOf(2004, FOREIGN_CATEGORY)?.nominations;
    expect(nominations?.[0].isWinner).toBe(true);
  });

  it('Wikidataの英語ラベルを原題として持つ', () => {
    expect(
      categoryOf(2004, GRAND_PRIX_CATEGORY)?.nominations[0].titles[0],
    ).toEqual({
      imdbId: 'tt0427312',
      title: '血と骨',
      originalTitle: 'Blood and Bones',
    });
  });

  it('解決できた作品が無い回を取り込まない', () => {
    expect(editionOf(1946)).toBeUndefined();
  });
});

describe('extractAwardEditions', () => {
  const editions = parseMainichiWikitext(sampleWikitext);
  const resolved = new Map([
    ['血と骨', {imdbId: 'tt0427312', englishTitle: 'Blood and Bones'}],
  ]);
  const data = toImdbEventData(editions, resolved);

  it('大賞のカテゴリだけを取り込む', () => {
    const edition = extractAwardEditions(data, mainichiGrandPrixConfig).find(
      entry => entry.year === 2004,
    );
    expect(edition?.films.map(film => film.imdbId)).toEqual(['tt0427312']);
  });
});
