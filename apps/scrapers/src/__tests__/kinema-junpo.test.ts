import {describe, expect, it} from 'vitest';
import {selectTmdbMatch} from '../common/tmdb-film-resolver';
import {extractAwardEditions} from '../imdb-event-award';
import {
  kinemaJunpoCeremonyNumber,
  kinemaJunpoFilmReferences,
  kinemaJunpoJapaneseConfig,
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

describe('selectTmdbMatch', () => {
  const kokuho = {
    id: 1,
    title: '国宝',
    original_title: '国宝',
    release_date: '2025-06-06',
    original_language: 'ja',
  };

  it('邦題・公開年・日本映画がそろった候補を返す', () => {
    expect(selectTmdbMatch([kokuho], '国宝', 2025)).toEqual(kokuho);
  });

  it('前年公開のずれを許容する', () => {
    expect(selectTmdbMatch([kokuho], '国宝', 2026)).toEqual(kokuho);
  });

  it('公開年が離れた候補を採用しない', () => {
    expect(selectTmdbMatch([kokuho], '国宝', 2020)).toBeUndefined();
  });

  it('邦題が一致しない候補を採用しない', () => {
    expect(selectTmdbMatch([kokuho], '国宝 序章', 2025)).toBeUndefined();
  });

  it('空白の違いを無視して一致させる', () => {
    const spaced = {...kokuho, title: '国宝 '};
    expect(selectTmdbMatch([spaced], '国宝', 2025)).toEqual(spaced);
  });

  it('日本映画でない候補を採用しない', () => {
    expect(
      selectTmdbMatch([{...kokuho, original_language: 'en'}], '国宝', 2025),
    ).toBeUndefined();
  });

  it('同名の候補が複数あるときは採用しない', () => {
    expect(
      selectTmdbMatch([kokuho, {...kokuho, id: 2}], '国宝', 2025),
    ).toBeUndefined();
  });

  it('原題側の一致も見る', () => {
    const original = {...kokuho, title: 'Kokuho'};
    expect(selectTmdbMatch([original], '国宝', 2025)).toEqual(original);
  });

  describe('外国映画', () => {
    const laConfidential = {
      id: 3,
      title: 'L.A.コンフィデンシャル',
      original_title: 'L.A. Confidential',
      release_date: '1997-09-19',
      original_language: 'en',
    };

    it('本国公開から日本公開までのずれを許容する', () => {
      expect(
        selectTmdbMatch([laConfidential], 'L.A.コンフィデンシャル', 1998, {
          foreign: true,
        }),
      ).toEqual(laConfidential);
    });

    it('公開が古すぎる候補は採用しない', () => {
      expect(
        selectTmdbMatch([laConfidential], 'L.A.コンフィデンシャル', 2020, {
          foreign: true,
        }),
      ).toBeUndefined();
    });

    it('日本映画を外国映画として採用しない', () => {
      expect(
        selectTmdbMatch(
          [{...laConfidential, original_language: 'ja'}],
          'L.A.コンフィデンシャル',
          1998,
          {foreign: true},
        ),
      ).toBeUndefined();
    });

    it('日本公開より後の作品は採用しない', () => {
      expect(
        selectTmdbMatch([laConfidential], 'L.A.コンフィデンシャル', 1995, {
          foreign: true,
        }),
      ).toBeUndefined();
    });
  });
});

describe('extractAwardEditions', () => {
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
  ]);
  const data = toImdbEventData(editions, resolved);

  it('順位をspecialMentionとして取り込む', () => {
    const films =
      extractAwardEditions(data, kinemaJunpoJapaneseConfig).find(
        edition => edition.year === 1932,
      )?.films ?? [];

    expect(films.map(film => film.specialMention)).toEqual(['1位', '2位']);
  });

  it('specialMentionを使わない賞では順位を持たない', () => {
    const films =
      extractAwardEditions(data, {
        ...kinemaJunpoJapaneseConfig,
        useNotesAsSpecialMention: false,
      }).find(edition => edition.year === 1932)?.films ?? [];

    expect(films.every(film => film.specialMention === undefined)).toBe(true);
  });
});

describe('自動同定できない作品の直指定', () => {
  const wikitext = `== キネマ旬報ベスト・テン ==
==== 第4回（1927年度） ====
{{col|
'''日本映画ベスト・テン'''
#[[忠次旅日記#第二部「信州血笑篇」|忠次旅日記 信州血笑篇]]（[[伊藤大輔 (映画監督)|伊藤大輔]]監督）
#[[彼を繞る五人の女]]（阿部豊監督）
#[[忠次旅日記#第三部「忠次御用篇」|忠次旅日記 御用篇]]（伊藤大輔監督）
|
'''外国映画ベスト・テン'''
#[[第七天国 (1927年の映画)|第七天国]]（フランク・ボーサージ監督）
}}
`;
  const editions = parseKinemaJunpoWikitext(wikitext);
  const resolved = new Map([
    ['彼を繞る五人の女', {imdbId: 'tt11337376', englishTitle: undefined}],
  ]);
  const nominations = toImdbEventData(editions, resolved).editions[0]
    .targetAward[0].categories[0].nominations;

  it('同じ記事を共有する連作の各篇を直指定のIMDb IDで取り込む', () => {
    expect(nominations.map(nomination => nomination.titles[0].imdbId)).toEqual([
      'tt0432794',
      'tt11337376',
      'tt0342196',
    ]);
  });

  it('直指定した1位を受賞にする', () => {
    expect(nominations[0].isWinner).toBe(true);
    expect(nominations[0].titles[0].title).toBe('忠次旅日記 信州血笑篇');
  });

  it('直指定した作品を同定の対象から外す', () => {
    expect(
      kinemaJunpoFilmReferences(editions).map(reference => reference.title),
    ).toEqual(['彼を繞る五人の女', '第七天国']);
  });
});
