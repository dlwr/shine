import {describe, expect, it} from 'vitest';
import {
  BEST_FILM_CATEGORY,
  FOREIGN_CATEGORY,
  YUJIRO_CATEGORY,
  nikkanSportsCeremonyNumber,
  nikkanSportsFilmReferences,
  parseNikkanSportsWikitext,
  toImdbEventData,
} from '../nikkan-sports-film-awards';

const sampleWikitext = `== 概要 ==
本文。

== 歴代各賞 ==
=== 第1回（1988年度） - 第10回（1997年度） ===
==== 第1回（1988年度） ====
*作品賞 『[[華の乱]]』（[[深作欣二]]）
*主演男優賞 [[渥美清]]（『[[男はつらいよ 寅次郎物語]]』）
*外国作品賞 『[[ラストエンペラー]]』（[[ベルナルド・ベルトルッチ]]）
*石原裕次郎賞 『[[敦煌 (映画)|敦煌]]』（[[佐藤純弥]]）
*石原裕次郎新人賞 [[緒形直人]]（『[[優駿 ORACION]]』） <ref name="history">{{Cite web|和書|title=日刊スポーツ映画大賞 歴代の受賞者『別の映画』}}</ref>

==== 第10回（1997年度） ====
*作品賞 『[[愛する (映画)|愛する]]』（[[熊井啓]]）
*外国作品賞 『[[イングリッシュ・ペイシェント]]』（[[アンソニー・ミンゲラ]]）
*石原裕次郎賞 『もののけ姫』（宮崎駿） <ref name="history" />

=== 第11回（1998年度） - 第20回（2007年度） ===
==== 第15回（2002年度） ====
{{節スタブ|1=主演賞・助演賞の対象作品名|date=2020年11月}}
*作品賞 『[[たそがれ清兵衛]]{{R|history}}』（[[山田洋次]]
*外国作品賞 『[[息子の部屋]]{{R|history}}』（[[ナンニ・モレッティ]]）
*石原裕次郎賞 『[[陽はまた昇る (2002年の映画)|陽はまた昇る]]{{R|history}}』（[[佐々部清]]）

==== 第33回（2020年度） ====
*作品賞 『[[罪の声#映画|罪の声]]』（[[土井裕泰]]）<ref name="a"/>
*外国作品賞 『[[はちどり (映画)|はちどり]]』（[[キム・ボラ (映画監督)|キム・ボラ]]）<ref name="a"/>
*石原裕次郎賞 『[[劇場版「鬼滅の刃」無限列車編]]』（[[外崎春雄]]）<ref name="a"/>

==== 第34回（2021年度） ====
*作品賞 『[[ドライブ・マイ・カー (映画)|ドライブ・マイ・カー]]』（[[濱口竜介]]）
*外国作品賞 『[[ノマドランド]]』（[[クロエ・ジャオ]]）
*石原裕次郎賞 『燃えよ剣』（[[原田眞人]]）
*ファンが選ぶ最高作品賞『[[天外者]]』（[[田中光敏]]）

== 脚注 ==
*作品賞 『[[脚注の作品]]』
`;

describe('nikkanSportsCeremonyNumber', () => {
  it('第1回は1988年度', () => {
    expect(nikkanSportsCeremonyNumber(1988)).toBe(1);
  });

  it('2025年度は第38回', () => {
    expect(nikkanSportsCeremonyNumber(2025)).toBe(38);
  });

  it('第1回より前は回次を持たない', () => {
    expect(nikkanSportsCeremonyNumber(1987)).toBeUndefined();
  });
});

describe('parseNikkanSportsWikitext', () => {
  const editions = parseNikkanSportsWikitext(sampleWikitext);
  const editionOf = (year: number) =>
    editions.find(edition => edition.year === year);

  it('回ごとに分割する', () => {
    expect(editions.map(edition => edition.year)).toEqual([
      1988, 1997, 2002, 2020, 2021,
    ]);
  });

  it('作品賞を取り込む', () => {
    expect(editionOf(1988)?.bestFilm).toEqual([
      {page: '華の乱', title: '華の乱'},
    ]);
  });

  it('外国作品賞を取り込む', () => {
    expect(editionOf(1988)?.foreign).toEqual([
      {page: 'ラストエンペラー', title: 'ラストエンペラー'},
    ]);
  });

  it('石原裕次郎賞を取り込む', () => {
    expect(editionOf(1988)?.yujiro).toEqual([
      {page: '敦煌 (映画)', title: '敦煌'},
    ]);
  });

  it('作品以外の賞を取り込まない', () => {
    const titles = editions.flatMap(edition => [
      ...edition.bestFilm,
      ...edition.foreign,
      ...edition.yujiro,
    ]);
    expect(titles.map(film => film.title)).not.toContain(
      '男はつらいよ 寅次郎物語',
    );
    expect(titles.map(film => film.title)).not.toContain('優駿 ORACION');
    expect(titles.map(film => film.title)).not.toContain('天外者');
  });

  it('出典の中の題名を取り込まない', () => {
    const titles = editions.flatMap(edition => edition.yujiro);
    expect(titles.map(film => film.title)).not.toContain('別の映画');
  });

  it('リンクの無い裸の題名を取り込む', () => {
    expect(editionOf(1997)?.yujiro).toEqual([{title: 'もののけ姫'}]);
  });

  it('『』内に出典テンプレートが混じっても記事名を取り出す', () => {
    expect(editionOf(2002)?.bestFilm).toEqual([
      {page: 'たそがれ清兵衛', title: 'たそがれ清兵衛'},
    ]);
  });

  it('セクションアンカー付きのリンクから記事名を取り出す', () => {
    expect(editionOf(2020)?.bestFilm).toEqual([
      {page: '罪の声', title: '罪の声'},
    ]);
  });

  it('歴代各賞より後のセクションを取り込まない', () => {
    const titles = editions.flatMap(edition => edition.bestFilm);
    expect(titles.map(film => film.title)).not.toContain('脚注の作品');
  });
});

describe('nikkanSportsFilmReferences', () => {
  const editions = parseNikkanSportsWikitext(sampleWikitext);
  const references = nikkanSportsFilmReferences(editions);

  it('日本映画は前後1年の窓を持つ', () => {
    const reference = references.find(
      entry => entry.title === 'ドライブ・マイ・カー',
    );
    expect(reference?.targetYear).toBe(2021);
    expect(reference?.yearWindow).toEqual({min: -1, max: 1});
    expect(reference?.foreign).toBe(false);
  });

  it('石原裕次郎賞も日本映画の窓を持つ', () => {
    const reference = references.find(entry => entry.title === '燃えよ剣');
    expect(reference?.yearWindow).toEqual({min: -1, max: 1});
    expect(reference?.foreign).toBe(false);
  });

  it('外国映画は年度より前の公開を許容する', () => {
    const reference = references.find(entry => entry.title === 'ノマドランド');
    expect(reference?.yearWindow).toEqual({min: -Infinity, max: 1});
    expect(reference?.foreign).toBe(true);
  });
});

describe('toImdbEventData', () => {
  const editions = parseNikkanSportsWikitext(sampleWikitext);
  const resolved = new Map([
    [
      'ドライブ・マイ・カー (映画)',
      {imdbId: 'tt14039582', englishTitle: 'Drive My Car'},
    ],
    ['ノマドランド', {imdbId: 'tt9770150', englishTitle: 'Nomadland'}],
    [
      'title:燃えよ剣',
      {imdbId: 'tt13445090', englishTitle: 'Baragaki: Unbroken Samurai'},
    ],
  ]);
  const data = toImdbEventData(editions, resolved);
  const categoryOf = (year: number, name: string) =>
    data.editions
      .find(edition => edition.year === year)
      ?.targetAward[0].categories.find(category => category.category === name);

  it('作品賞を受賞として取り込む', () => {
    const nominations = categoryOf(2021, BEST_FILM_CATEGORY)?.nominations;
    expect(nominations).toHaveLength(1);
    expect(nominations?.[0].isWinner).toBe(true);
  });

  it('外国作品賞を受賞として取り込む', () => {
    const nominations = categoryOf(2021, FOREIGN_CATEGORY)?.nominations;
    expect(nominations?.[0].isWinner).toBe(true);
  });

  it('リンクの無い石原裕次郎賞の題名で解決した映画を取り込む', () => {
    expect(categoryOf(2021, YUJIRO_CATEGORY)?.nominations[0].titles[0]).toEqual(
      {
        imdbId: 'tt13445090',
        title: '燃えよ剣',
        originalTitle: 'Baragaki: Unbroken Samurai',
      },
    );
  });

  it('解決できた作品が無い回を取り込まない', () => {
    expect(
      data.editions.find(edition => edition.year === 1988),
    ).toBeUndefined();
  });
});
