import {describe, expect, it} from 'vitest';
import {
  kinemaJunpoCeremonyNumber,
  parseKinemaJunpoWikitext,
  toImdbEventData,
} from '../kinema-junpo';

const sampleWikitext = `== キネマ旬報ベスト・テン ==
本文。

=== 1920年代 ===
==== 第1回（1924年度） ====
{{col|
'''芸術的に最も優れた映画'''
#[[巴里の女性]]（[[チャールズ・チャップリン]]監督）
#[[結婚哲学]]（[[エルンスト・ルビッチ]]監督）
|
'''娯楽的に最も優れた映画'''
#[[幌馬車 (1923年の映画)|幌馬車]]（[[ジェイムズ・クルーズ]]監督）
#心なき女性（レックス・イングラム監督）
}}

==== 第9回（1932年度） ====
{{col|
'''日本映画ベスト・テン'''
#[[大人の見る繪本 生れてはみたけれど|生れてはみたけれど]]（小津安二郎監督）
#[[御誂次郎吉格子]]（伊藤大輔監督）<br />[[弥太郎笠]]（稲垣浩監督）
# -
#[[國士無双]]（[[伊丹万作]]監督）
|
'''外国映画ベスト・テン'''
#[[自由を我等に]]（ルネ・クレール監督）
}}

==== 第20回（1946年度） ====
{{col|
'''日本映画'''
#[[大曾根家の朝]]（[[木下惠介]]監督）
|
'''外国映画'''
#[[我が道を往く]]（レオ・マッケリー監督）
}}

==== 第99回（2025年度） ====
* 日本映画監督賞 [[李相日]]（『[[国宝 (映画)|国宝]]』）
{{col|
'''日本映画ベスト・テン'''
#[[旅と日々]]（[[三宅唱]]監督）
#[[敵 (小説)#映画|敵]]（吉田大八監督）|
'''外国映画ベスト・テン'''
#[[ワン・バトル・アフター・アナザー]]（ポール・トーマス・アンダーソン監督）
}}
'''読者選出日本映画ベスト・テン'''
#[[国宝 (映画)|国宝]]（李相日監督）

== 歴代1位 ==
'''日本映画ベスト・テン'''
#[[羅生門 (1950年の映画)|羅生門]]
`;

describe('kinemaJunpoCeremonyNumber', () => {
  it('第1回は1924年度', () => {
    expect(kinemaJunpoCeremonyNumber(1924)).toBe(1);
  });

  it('中断前の1942年度は第19回', () => {
    expect(kinemaJunpoCeremonyNumber(1942)).toBe(19);
  });

  it('戦争で中断した1943〜1945年度は回次を持たない', () => {
    expect(kinemaJunpoCeremonyNumber(1943)).toBeUndefined();
    expect(kinemaJunpoCeremonyNumber(1945)).toBeUndefined();
  });

  it('再開した1946年度は第20回', () => {
    expect(kinemaJunpoCeremonyNumber(1946)).toBe(20);
  });

  it('2025年度は第99回', () => {
    expect(kinemaJunpoCeremonyNumber(2025)).toBe(99);
  });

  it('第1回より前は回次を持たない', () => {
    expect(kinemaJunpoCeremonyNumber(1923)).toBeUndefined();
  });
});

describe('parseKinemaJunpoWikitext', () => {
  const editions = parseKinemaJunpoWikitext(sampleWikitext);
  const editionOf = (year: number) =>
    editions.find(edition => edition.year === year);

  it('回ごとに分割する', () => {
    expect(editions.map(edition => edition.year)).toEqual([
      1924, 1932, 1946, 2025,
    ]);
  });

  it('記事名と表示名を分けて取り込む', () => {
    expect(editionOf(1932)?.japanese[0]).toEqual({
      rank: 1,
      page: '大人の見る繪本 生れてはみたけれど',
      title: '生れてはみたけれど',
    });
  });

  it('同順位の作品を同じ順位で取り込む', () => {
    const second = editionOf(1932)?.japanese.filter(film => film.rank === 2);
    expect(second?.map(film => film.title)).toEqual([
      '御誂次郎吉格子',
      '弥太郎笠',
    ]);
  });

  it('空欄の順位を作品として数えない', () => {
    expect(editionOf(1932)?.japanese.map(film => film.rank)).toEqual([
      1, 2, 2, 4,
    ]);
  });

  it('監督名のリンクを作品として取り込まない', () => {
    const titles = editionOf(1932)?.japanese.map(film => film.title);
    expect(titles).not.toContain('伊丹万作');
  });

  it('記事が存在しない作品は記事名を持たない', () => {
    const film = editionOf(1924)?.foreign.find(
      entry => entry.title === '心なき女性',
    );
    expect(film?.page).toBeUndefined();
  });

  it('セクションアンカー付きのリンクから記事名を取り出す', () => {
    expect(editionOf(2025)?.japanese[1]).toEqual({
      rank: 2,
      page: '敵 (小説)',
      title: '敵',
    });
  });

  it('日本映画部門を持たない初期の回は外国映画だけを取り込む', () => {
    expect(editionOf(1924)?.japanese).toEqual([]);
    expect(editionOf(1924)?.foreign.map(film => film.title)).toEqual([
      '巴里の女性',
      '結婚哲学',
      '幌馬車',
      '心なき女性',
    ]);
  });

  it('旧部門名を日本映画・外国映画に振り分ける', () => {
    expect(editionOf(1946)?.japanese.map(film => film.title)).toEqual([
      '大曾根家の朝',
    ]);
    expect(editionOf(1946)?.foreign.map(film => film.title)).toEqual([
      '我が道を往く',
    ]);
  });

  it('読者選出部門を取り込まない', () => {
    expect(editionOf(2025)?.japanese.map(film => film.title)).toEqual([
      '旅と日々',
      '敵',
    ]);
  });

  it('最終回のセクションを次の見出しで打ち切る', () => {
    expect(
      editionOf(2025)?.japanese.some(film => film.title === '羅生門'),
    ).toBe(false);
  });
});

describe('toImdbEventData', () => {
  const editions = parseKinemaJunpoWikitext(sampleWikitext);
  const resolved = new Map([
    [
      '大人の見る繪本 生れてはみたけれど',
      {imdbId: 'tt0023139', englishTitle: 'I Was Born, But...'},
    ],
    [
      '御誂次郎吉格子',
      {imdbId: 'tt0023375', englishTitle: 'Jirokichi the Rat'},
    ],
    ['自由を我等に', {imdbId: 'tt0021785', englishTitle: 'À nous la liberté'}],
  ]);
  const data = toImdbEventData(editions, resolved);
  const editionOf = (year: number) =>
    data.editions.find(edition => edition.year === year);
  const categoryOf = (year: number, name: string) =>
    editionOf(year)?.targetAward[0].categories.find(
      category => category.category === name,
    );

  it('IMDb IDを解決できた作品だけを取り込む', () => {
    expect(
      categoryOf(1932, 'Best Japanese Film')?.nominations.flatMap(
        nomination => nomination.titles,
      ),
    ).toHaveLength(2);
  });

  it('1位を受賞として取り込む', () => {
    const nominations =
      categoryOf(1932, 'Best Japanese Film')?.nominations ?? [];
    expect(nominations[0].isWinner).toBe(true);
    expect(nominations[1].isWinner).toBe(false);
  });

  it('Wikidataの英語ラベルを原題として持つ', () => {
    expect(
      categoryOf(1932, 'Best Japanese Film')?.nominations[0].titles[0],
    ).toEqual({
      imdbId: 'tt0023139',
      title: '生れてはみたけれど',
      originalTitle: 'I Was Born, But...',
    });
  });

  it('日本映画と外国映画を別カテゴリにする', () => {
    expect(
      categoryOf(1932, 'Best Foreign Film')?.nominations[0].titles[0].imdbId,
    ).toBe('tt0021785');
  });

  it('解決できた作品が無い回を取り込まない', () => {
    expect(editionOf(2025)).toBeUndefined();
  });

  it('順位を注記として残す', () => {
    expect(categoryOf(1932, 'Best Japanese Film')?.nominations[1].notes).toBe(
      '2位',
    );
  });
});
