import {describe, expect, it} from 'vitest';
import {
  BEST_TEN_CATEGORY,
  parseYokohamaWikitext,
  rankNote,
  toImdbEventData,
  yokohamaCeremonyNumber,
  yokohamaFilmReferences,
} from '../yokohama-film-festival';

const sampleWikitext = `== 概要 ==
本文。

== 歴代各賞 ==
※ 表記上の制限のため、日本映画ベストテンの「次点」を「11.」と表記している。

=== 第1回（1979年度） - 第10回（1988年度） ===
==== 第1回（1979年度） ====
開催日：[[1980年]]2月3日
*作品賞 『[[太陽を盗んだ男]]』（[[長谷川和彦]]）
*主演男優賞 [[緒形拳]]（『[[復讐するは我にあり]]』）

'''1979年度日本映画ベストテン'''
#[[太陽を盗んだ男]]（[[長谷川和彦]]）
#[[赫い髪の女]]（[[神代辰巳]]）<br />[[天使のはらわた 赤い教室]]（[[曽根中生]]）
#[[もっとしなやかに もっとしたたかに]]（[[藤田敏八]]）
#[[復讐するは我にあり]]（[[今村昌平]]）
#[[その後の仁義なき戦い]]（[[工藤栄一]]）
#[[十九歳の地図]]（[[柳町光男]]）
#天使の欲望（[[関本郁夫]]）
#濡れた週末（[[根岸吉太郎]]）
#[[Keiko (映画)|Keiko]]（[[クロード・ガニオン]]）
#[[十代 恵子の場合]]（[[内藤誠]]）
#[[ユー・ガッタ・チャンス]]（[[大森一樹]]）<br >[[火まつり (映画)|火まつり]]（[[柳町光男]]）

==== 第9回（1987年度） ==== 
*作品賞 『[[ゆきゆきて、神軍]]』（[[原一男]]）

'''1987年度日本映画ベストテン'''
#[[ゆきゆきて、神軍]]（[[原一男]]）
#[[本場ぢょしこうマニュアル#映画版|本場ぢょしこうマニュアル 初恋微熱篇]]』（[[中田新一]]）
#シネマ☆インパクト [[恋の渦#映画|恋の渦]]（[[大根仁]]）
#[[止められるか、俺たちを]](白石和彌)

==== 第42回（2020年度） ====
[[新型コロナウイルス感染拡大]]のため開催中止（賞の贈呈のみ）<ref>出典『別の映画』</ref>

*作品賞 『[[海辺の映画館―キネマの玉手箱]]』（[[大林宣彦]]）
*主演男優賞 [[二宮和也]]（『[[浅田家!]]』）
*助演男優賞
** [[宇野祥平]]（『[[罪の声#映画|罪の声]]』『[[本気のしるし#テレビドラマ|本気のしるし〈劇場版〉]]』）
* 審査員特別賞 [[細川岳]]と「佐々木、イン、マイマイン」

;2020年度日本映画ベストテン
:#海辺の映画館 キネマの玉手箱（大林宣彦）
:#浅田家!（[[中野量太]]）
:#罪の声（[[土井裕泰]]）
:#[[スパイの妻]]（[[黒沢清]]）
:#本気のしるし〈劇場版〉（[[深田晃司]]）

==== 第47回（2025年度） ====
開催日：2026年2月1日（予定）
*作品賞 『[[国宝 (映画)|国宝]]』（[[李相日]]）

;2025年度日本映画ベストテン
:# 国宝（李相日）
:# [[宝島 (真藤順丈の小説)#映画|宝島]]（[[大友啓史]]）

== 脚注 ==
#[[脚注の作品]]（誰か）
`;

describe('yokohamaCeremonyNumber', () => {
  it('第1回は1979年度', () => {
    expect(yokohamaCeremonyNumber(1979)).toBe(1);
  });

  it('2025年度は第47回', () => {
    expect(yokohamaCeremonyNumber(2025)).toBe(47);
  });

  it('第1回より前は回次を持たない', () => {
    expect(yokohamaCeremonyNumber(1978)).toBeUndefined();
  });
});

describe('rankNote', () => {
  it('10位までは順位', () => {
    expect(rankNote(1)).toBe('1位');
    expect(rankNote(10)).toBe('10位');
  });

  it('11番目は次点', () => {
    expect(rankNote(11)).toBe('次点');
  });
});

describe('parseYokohamaWikitext', () => {
  const editions = parseYokohamaWikitext(sampleWikitext);
  const editionOf = (year: number) =>
    editions.find(edition => edition.year === year);

  it('回ごとに分割する', () => {
    expect(editions.map(edition => edition.year)).toEqual([
      1979, 1987, 2020, 2025,
    ]);
  });

  it('記事名と表示名を分けて順位付きで取り込む', () => {
    expect(editionOf(1979)?.bestTen[0]).toEqual({
      rank: 1,
      page: '太陽を盗んだ男',
      title: '太陽を盗んだ男',
    });
  });

  it('同順位の作品を同じ順位で取り込む', () => {
    const second = editionOf(1979)?.bestTen.filter(film => film.rank === 2);
    expect(second?.map(film => film.title)).toEqual([
      '赫い髪の女',
      '天使のはらわた 赤い教室',
    ]);
  });

  it('同順位の次の作品は行の番号を順位に持つ', () => {
    expect(
      editionOf(1979)?.bestTen.find(
        film => film.title === 'もっとしなやかに もっとしたたかに',
      )?.rank,
    ).toBe(3);
  });

  it('閉じタグが崩れた改行でも同順位に分ける', () => {
    const runnerUp = editionOf(1979)?.bestTen.filter(film => film.rank === 11);
    expect(runnerUp?.map(film => film.title)).toEqual([
      'ユー・ガッタ・チャンス',
      '火まつり',
    ]);
  });

  it('監督名のリンクを作品として取り込まない', () => {
    const titles = editionOf(1979)?.bestTen.map(film => film.title);
    expect(titles).not.toContain('関本郁夫');
  });

  it('記事が存在しない作品は記事名を持たない', () => {
    expect(
      editionOf(1979)?.bestTen.find(film => film.title === '天使の欲望'),
    ).toEqual({rank: 7, title: '天使の欲望'});
  });

  it('セクションアンカー付きのリンクから記事名を取り出す', () => {
    expect(editionOf(1987)?.bestTen[1]).toEqual({
      rank: 2,
      page: '本場ぢょしこうマニュアル',
      title: '本場ぢょしこうマニュアル 初恋微熱篇',
    });
  });

  it('リンクの前に添え書きがあっても記事名を取り出す', () => {
    expect(editionOf(1987)?.bestTen[2]).toEqual({
      rank: 3,
      page: '恋の渦',
      title: '恋の渦',
    });
  });

  it('半角括弧の監督名を取り込まない', () => {
    expect(editionOf(1987)?.bestTen[3]).toEqual({
      rank: 4,
      page: '止められるか、俺たちを',
      title: '止められるか、俺たちを',
    });
  });

  it('定義リスト形式のベストテンを取り込む', () => {
    expect(editionOf(2025)?.bestTen).toEqual([
      {rank: 1, page: '国宝 (映画)', title: '国宝'},
      {rank: 2, page: '宝島 (真藤順丈の小説)', title: '宝島'},
    ]);
  });

  it('リンクの無い作品に同じ回の『』内リンクの記事名を補う', () => {
    expect(editionOf(2020)?.bestTen[1]).toEqual({
      rank: 2,
      page: '浅田家!',
      title: '浅田家!',
    });
    expect(editionOf(2020)?.bestTen[2]).toEqual({
      rank: 3,
      page: '罪の声',
      title: '罪の声',
    });
  });

  it('表示名が一致しないリンクは補わない', () => {
    expect(editionOf(2020)?.bestTen[0]).toEqual({
      rank: 1,
      title: '海辺の映画館 キネマの玉手箱',
    });
  });

  it('作品賞の記事名を1位に補う', () => {
    expect(editionOf(2025)?.bestTen[0].page).toBe('国宝 (映画)');
  });

  it('歴代各賞より後のセクションを取り込まない', () => {
    const titles = editions.flatMap(edition => edition.bestTen);
    expect(titles.map(film => film.title)).not.toContain('脚注の作品');
  });
});

describe('yokohamaFilmReferences', () => {
  const editions = parseYokohamaWikitext(sampleWikitext);
  const references = yokohamaFilmReferences(editions);

  it('記事名を鍵にする', () => {
    const reference = references.find(
      entry => entry.title === '太陽を盗んだ男',
    );
    expect(reference?.key).toBe('太陽を盗んだ男');
  });

  it('記事の無い作品は表示名を鍵にする', () => {
    const reference = references.find(entry => entry.title === '天使の欲望');
    expect(reference?.key).toBe('title:天使の欲望');
  });

  it('日本映画として前後1年の窓を持つ', () => {
    const reference = references.find(entry => entry.title === '国宝');
    expect(reference?.targetYear).toBe(2025);
    expect(reference?.yearWindow).toEqual({min: -1, max: 1});
    expect(reference?.foreign).toBe(false);
  });
});

describe('toImdbEventData', () => {
  const editions = parseYokohamaWikitext(sampleWikitext);
  const resolved = new Map([
    [
      '太陽を盗んだ男',
      {imdbId: 'tt0079930', englishTitle: 'The Man Who Stole the Sun'},
    ],
    [
      '赫い髪の女',
      {imdbId: 'tt0079838', englishTitle: 'The Woman with Red Hair'},
    ],
    ['title:天使の欲望', {imdbId: 'tt0079000', englishTitle: 'Angel Desire'}],
    [
      'ユー・ガッタ・チャンス',
      {imdbId: 'tt0090280', englishTitle: 'You Gotta Chance'},
    ],
    ['国宝 (映画)', {imdbId: 'tt32826305', englishTitle: 'Kokuho'}],
  ]);
  const data = toImdbEventData(editions, resolved);
  const nominationsOf = (year: number) =>
    data.editions
      .find(edition => edition.year === year)
      ?.targetAward[0].categories.find(
        category => category.category === BEST_TEN_CATEGORY,
      )?.nominations;

  it('1位を受賞として取り込む', () => {
    const first = nominationsOf(1979)?.find(
      nomination => nomination.titles[0].imdbId === 'tt0079930',
    );
    expect(first?.isWinner).toBe(true);
    expect(first?.notes).toBe('1位');
  });

  it('2位以下を順位付きのノミネートとして取り込む', () => {
    const second = nominationsOf(1979)?.find(
      nomination => nomination.titles[0].imdbId === 'tt0079838',
    );
    expect(second?.isWinner).toBe(false);
    expect(second?.notes).toBe('2位');
  });

  it('11番目を次点として取り込む', () => {
    const runnerUp = nominationsOf(1979)?.find(
      nomination => nomination.titles[0].imdbId === 'tt0090280',
    );
    expect(runnerUp?.isWinner).toBe(false);
    expect(runnerUp?.notes).toBe('次点');
  });

  it('表示名で解決した作品を取り込む', () => {
    expect(
      nominationsOf(1979)?.find(
        nomination => nomination.titles[0].imdbId === 'tt0079000',
      )?.titles[0],
    ).toEqual({
      imdbId: 'tt0079000',
      title: '天使の欲望',
      originalTitle: 'Angel Desire',
    });
  });

  it('直指定したIMDb IDで取り込む', () => {
    const overridden = nominationsOf(1979)?.find(
      nomination => nomination.titles[0].title === '十代 恵子の場合',
    );
    expect(overridden?.titles[0].imdbId).toBe('tt9679368');
    expect(overridden?.notes).toBe('10位');
  });

  it('IMDb IDを解決できた作品だけを取り込む', () => {
    expect(nominationsOf(1979)).toHaveLength(5);
  });

  it('解決できた作品が無い回を取り込まない', () => {
    expect(
      data.editions.find(edition => edition.year === 1987),
    ).toBeUndefined();
  });
});
