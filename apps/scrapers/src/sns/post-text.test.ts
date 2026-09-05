import {describe, expect, it} from 'vitest';
import {
  buildAnnouncementPostText,
  buildAnnouncementXPostText,
  buildDailyPostText,
  buildMonthlyPostText,
  buildMonthlyReminderPostText,
  buildMonthlyReminderXPostText,
  buildMonthlyLinksPostText,
  buildMonthlyLinksXPostText,
  buildMonthlyRoundupPostText,
  buildMonthlyRoundupXPostText,
  buildMonthlyXPostText,
  buildQuizPostText,
  buildQuizShareUrl,
  buildPersonPostText,
  buildPersonXPostText,
  buildQuizXPostText,
  buildWatchedPostText,
  buildWatchedXPostText,
  buildXPostText,
  xWeightedLength,
} from './post-text';

const base = {
  title: 'ハウスメイド',
  year: 2010,
  organizations: ['Cannes Film Festival'],
  availabilityLabels: ['U-NEXT 見放題'],
};

describe('buildDailyPostText', () => {
  it('タイトルと年を含む', () => {
    expect(buildDailyPostText(base)).toContain('『ハウスメイド』(2010)');
  });

  it('選出元を含む', () => {
    expect(buildDailyPostText(base)).toContain('Cannes Film Festival');
  });

  it('視聴可否ラベルを含む', () => {
    expect(buildDailyPostText(base)).toContain('U-NEXT 見放題');
  });

  it('年が無ければ括弧を出さない', () => {
    const text = buildDailyPostText({...base, year: undefined});

    expect(text).toContain('『ハウスメイド』');
    expect(text).not.toContain('()');
  });

  it('選出元が無ければその行を出さない', () => {
    const text = buildDailyPostText({...base, organizations: []});

    expect(text).not.toContain('選出');
  });

  it('視聴可否が無ければその行を出さない', () => {
    const text = buildDailyPostText({...base, availabilityLabels: []});

    expect(text).not.toContain('▶');
  });

  it('選出元は最大2つまでに絞る', () => {
    const text = buildDailyPostText({
      ...base,
      organizations: ['A', 'B', 'C'],
    });

    expect(text).toContain('A・B');
    expect(text).not.toContain('C');
  });

  it('300字(Blueskyの上限)を超えない', () => {
    const text = buildDailyPostText({
      ...base,
      title: 'あ'.repeat(200),
    });

    expect([...text].length).toBeLessThanOrEqual(300);
  });

  it('末尾に #青空映画部 タグを付ける', () => {
    expect(buildDailyPostText(base)).toMatch(/#青空映画部$/);
  });

  it('切り詰めが起きてもタグは末尾に残る', () => {
    const text = buildDailyPostText({
      ...base,
      title: 'あ'.repeat(400),
    });

    expect([...text].length).toBeLessThanOrEqual(300);
    expect(text).toMatch(/#青空映画部$/);
  });
});

describe('buildQuizPostText', () => {
  const quizBase = {date: '2026-08-16', poolSize: 1396};

  it('出題日を月日で入れる', () => {
    expect(buildQuizPostText(quizBase)).toContain('8/16');
  });

  it('遊び方を説明する', () => {
    expect(buildQuizPostText(quizBase)).toContain('ヒント');
  });

  it('出題プールの本数を含む', () => {
    expect(buildQuizPostText(quizBase)).toContain('1,396本');
  });

  it('末尾に #青空映画部 タグを付ける', () => {
    expect(buildQuizPostText(quizBase)).toMatch(/#青空映画部$/);
  });

  it('300字(Blueskyの上限)を超えない', () => {
    expect([...buildQuizPostText(quizBase)].length).toBeLessThanOrEqual(300);
  });
});

describe('buildQuizXPostText', () => {
  const quizBase = {
    date: '2026-08-16',
    poolSize: 1396,
    url: 'https://shine-film.com/quiz',
  };

  it('本文の末尾にスキームを外したURLを含む', () => {
    const text = buildQuizXPostText(quizBase);

    expect(text).toMatch(/\nshine-film\.com\/quiz$/);
    expect(text).not.toContain('https://');
  });

  it('ハッシュタグは付けない', () => {
    expect(buildQuizXPostText(quizBase)).not.toContain('#');
  });

  it('weighted長が280以内に収まる', () => {
    expect(xWeightedLength(buildQuizXPostText(quizBase))).toBeLessThanOrEqual(
      280,
    );
  });
});

describe('buildQuizShareUrl', () => {
  it('出題日をクエリに付けて日ごとに別URLにする', () => {
    expect(
      buildQuizShareUrl({
        siteUrl: 'https://shine-film.com',
        date: '2026-08-16',
      }),
    ).toBe('https://shine-film.com/quiz?d=2026-08-16');
  });

  it('日付が変われば別のURLを返す', () => {
    const first = buildQuizShareUrl({
      siteUrl: 'https://shine-film.com',
      date: '2026-08-16',
    });
    const second = buildQuizShareUrl({
      siteUrl: 'https://shine-film.com',
      date: '2026-08-17',
    });

    expect(first).not.toBe(second);
  });
});

describe('xWeightedLength', () => {
  it('ASCIIは1、日本語は2で数える', () => {
    expect(xWeightedLength('ab')).toBe(2);
    expect(xWeightedLength('あい')).toBe(4);
  });
});

describe('buildXPostText', () => {
  const xBase = {
    ...base,
    url: 'https://shine-film.com/movies/abc-123',
  };

  it('本文の末尾にスキームを外したURLを含む(リンク付き投稿の従量課金を避ける)', () => {
    const text = buildXPostText(xBase);

    expect(text).toMatch(/\nshine-film\.com\/movies\/abc-123$/);
    expect(text).not.toContain('https://');
  });

  it('タイトルと選出元と視聴可否を含む', () => {
    const text = buildXPostText(xBase);

    expect(text).toContain('『ハウスメイド』(2010)');
    expect(text).toContain('Cannes Film Festival');
    expect(text).toContain('U-NEXT 見放題');
  });

  it('ハッシュタグは付けない', () => {
    expect(buildXPostText(xBase)).not.toContain('#');
  });

  it('長いタイトルでも全体のweighted長が280以内に収まる', () => {
    const text = buildXPostText({
      ...xBase,
      title: 'あ'.repeat(300),
    });

    expect(xWeightedLength(text)).toBeLessThanOrEqual(280);
    expect(text).toMatch(/\nshine-film\.com\/movies\/abc-123$/);
  });
});

describe('buildWatchedPostText', () => {
  const input = {heading: 'カンヌ国際映画祭 パルム・ドール', total: 48};

  it('賞名と受賞作の本数を含む', () => {
    expect(buildWatchedPostText(input)).toContain(
      'カンヌ国際映画祭 パルム・ドールの歴代受賞作48本',
    );
  });

  it('何本観たかを問う', () => {
    expect(buildWatchedPostText(input)).toContain('何本観た？');
  });

  it('ハッシュタグで終わる', () => {
    expect(buildWatchedPostText(input).endsWith('\n#青空映画部')).toBe(true);
  });
});

describe('buildWatchedXPostText', () => {
  const input = {
    heading: 'カンヌ国際映画祭 パルム・ドール',
    total: 48,
    url: 'https://shine-film.com/watched/palme-dor',
  };

  it('裸のURLで終わる', () => {
    expect(
      buildWatchedXPostText(input).endsWith(
        '\nshine-film.com/watched/palme-dor',
      ),
    ).toBe(true);
  });

  it('ハッシュタグを含めない', () => {
    expect(buildWatchedXPostText(input)).not.toContain('#青空映画部');
  });

  it('Xの重み付き文字数に収まる', () => {
    expect(xWeightedLength(buildWatchedXPostText(input))).toBeLessThanOrEqual(
      280,
    );
  });
});

describe('buildPersonPostText', () => {
  const person = {
    name: '役所広司',
    role: 'actor' as const,
    wonCount: 13,
    nominatedCount: 20,
    topMovies: [
      {title: 'Shall we ダンス？', year: 1996},
      {title: 'PERFECT DAYS', year: 2023},
      {title: '孤狼の血', year: 2018},
    ],
  };

  it('名前と役割を含む', () => {
    expect(buildPersonPostText(person)).toContain(
      '今週の映画人 — 役所広司（俳優）',
    );
  });

  it('監督は「監督」と表記する', () => {
    expect(buildPersonPostText({...person, role: 'director'})).toContain(
      '役所広司（監督）',
    );
  });

  it('受賞回数とノミネート回数を含む', () => {
    expect(buildPersonPostText(person)).toContain(
      '監督賞・演技賞で13回受賞 / 20回ノミネート',
    );
  });

  it('代表作を年付きで並べる', () => {
    expect(buildPersonPostText(person)).toContain(
      '代表作: 『Shall we ダンス？』(1996)・『PERFECT DAYS』(2023)・『孤狼の血』(2018)',
    );
  });

  it('年の無い代表作は括弧を出さない', () => {
    const text = buildPersonPostText({
      ...person,
      topMovies: [{title: 'PERFECT DAYS', year: undefined}],
    });

    expect(text).toContain('代表作: 『PERFECT DAYS』');
    expect(text).not.toContain('()');
  });

  it('代表作が無ければその行を出さない', () => {
    expect(buildPersonPostText({...person, topMovies: []})).not.toContain(
      '代表作',
    );
  });

  it('ハッシュタグで終わる', () => {
    expect(buildPersonPostText(person)).toMatch(/\n#青空映画部$/);
  });
});

describe('buildPersonXPostText', () => {
  const person = {
    name: '役所広司',
    role: 'actor' as const,
    wonCount: 13,
    nominatedCount: 20,
    topMovies: [{title: 'PERFECT DAYS', year: 2023}],
    url: 'https://shine-film.com/people/abc',
  };

  it('裸のURLで終わる', () => {
    expect(buildPersonXPostText(person)).toMatch(
      /\nshine-film\.com\/people\/abc$/,
    );
  });

  it('ハッシュタグを含めない', () => {
    expect(buildPersonXPostText(person)).not.toContain('#');
  });

  it('代表作が長くてもXの重み付き文字数に収まる', () => {
    const text = buildPersonXPostText({
      ...person,
      topMovies: Array.from({length: 3}, (_, index) => ({
        title: `とても長い題名の映画${'あ'.repeat(60)}${index}`,
        year: 2000 + index,
      })),
    });

    expect(xWeightedLength(text)).toBeLessThanOrEqual(280);
    expect(text).toMatch(/…\nshine-film\.com\/people\/abc$/);
  });
});

describe('buildAnnouncementPostText', () => {
  const text =
    '第83回ヴェネツィア国際映画祭が開催中。\n金獅子賞の歴代受賞作69本、何本観た？';

  it('本文をそのまま使いハッシュタグで終わる', () => {
    expect(buildAnnouncementPostText({text})).toBe(`${text}\n#青空映画部`);
  });

  it('300字を超える本文は切り詰めてもタグを末尾に残す', () => {
    const result = buildAnnouncementPostText({text: 'あ'.repeat(400)});

    expect([...result].length).toBeLessThanOrEqual(300);
    expect(result).toMatch(/…\n#青空映画部$/);
  });
});

describe('buildAnnouncementXPostText', () => {
  const input = {
    text: '第83回ヴェネツィア国際映画祭が開催中。',
    url: 'https://shine-film.com/watched/venice-golden-lion',
  };

  it('本文の末尾に裸のURLを付ける', () => {
    expect(buildAnnouncementXPostText(input)).toBe(
      '第83回ヴェネツィア国際映画祭が開催中。\nshine-film.com/watched/venice-golden-lion',
    );
  });

  it('ハッシュタグを含めない', () => {
    expect(buildAnnouncementXPostText(input)).not.toContain('#');
  });

  it('本文が長くてもXの重み付き文字数に収まる', () => {
    const result = buildAnnouncementXPostText({
      ...input,
      text: 'あ'.repeat(200),
    });

    expect(xWeightedLength(result)).toBeLessThanOrEqual(280);
    expect(result).toMatch(/…\nshine-film\.com\/watched\/venice-golden-lion$/);
  });
});

describe('buildDailyPostText の今月の1本', () => {
  it('今月の1本のタイトルを末尾に添える', () => {
    const text = buildDailyPostText({...base, monthlyTitle: '浮雲'});

    expect(text).toContain('今月の1本は『浮雲』');
  });

  it('今月の1本が無ければその行を出さない', () => {
    expect(buildDailyPostText(base)).not.toContain('今月の1本');
  });

  it('X の本文にも今月の1本を添える', () => {
    const text = buildXPostText({
      ...base,
      monthlyTitle: '浮雲',
      url: 'https://shine-film.com/movies/abc',
    });

    expect(text).toContain('今月の1本は『浮雲』');
  });
});

describe('buildMonthlyPostText', () => {
  it('今月の1本として見出しを付ける', () => {
    expect(buildMonthlyPostText(base)).toContain(
      '今月の1本 —『ハウスメイド』(2010)',
    );
  });

  it('選出元と視聴可否を含む', () => {
    const text = buildMonthlyPostText(base);

    expect(text).toContain('Cannes Film Festival 選出');
    expect(text).toContain('▶ U-NEXT 見放題');
  });

  it('みんなで観ることとリンクを貼る誘いを書く', () => {
    const text = buildMonthlyPostText(base);

    expect(text).toContain('今月はみんなでこれを観る。');
    expect(text).toContain(
      '観たら感想や記事のリンクを映画ページに貼ってください。',
    );
  });

  it('ハッシュタグで終わる', () => {
    expect(buildMonthlyPostText(base)).toMatch(/#青空映画部$/);
  });

  it('X の本文は裸の URL で終わる', () => {
    const text = buildMonthlyXPostText({
      ...base,
      url: 'https://shine-film.com/movies/abc',
    });

    expect(text).toMatch(/shine-film\.com\/movies\/abc$/);
    expect(text).not.toContain('#青空映画部');
  });
});

describe('buildMonthlyReminderPostText', () => {
  const reminder = {
    title: 'ハウスメイド',
    year: 2010,
    availabilityLabels: ['U-NEXT 見放題'],
    linkCount: 3,
  };

  it('もう観たかを聞く', () => {
    expect(buildMonthlyReminderPostText(reminder)).toContain(
      '今月の1本『ハウスメイド』(2010)、もう観た？',
    );
  });

  it('残り半月と視聴可否を書く', () => {
    expect(buildMonthlyReminderPostText(reminder)).toContain(
      '今月は残り半分。▶ U-NEXT 見放題',
    );
  });

  it('集まった記事・ポストの件数を書く', () => {
    expect(buildMonthlyReminderPostText(reminder)).toContain(
      '観た人の記事・ポストが3件集まっています。',
    );
  });

  it('件数が0なら最初の1件を誘う', () => {
    const text = buildMonthlyReminderPostText({...reminder, linkCount: 0});

    expect(text).toContain(
      'まだ記事・ポストはありません。最初の1件を貼ってください。',
    );
    expect(text).not.toContain('集まっています');
  });

  it('視聴可否が無ければ残り半月だけ書く', () => {
    const text = buildMonthlyReminderPostText({
      ...reminder,
      availabilityLabels: [],
    });

    expect(text).toContain('今月は残り半分。');
    expect(text).not.toContain('▶');
  });

  it('X の本文は裸の URL で終わる', () => {
    const text = buildMonthlyReminderXPostText({
      ...reminder,
      url: 'https://shine-film.com/movies/abc',
    });

    expect(text).toMatch(/shine-film\.com\/movies\/abc$/);
  });
});

describe('buildMonthlyRoundupPostText', () => {
  const roundup = {
    title: 'ハウスメイド',
    year: 2010,
    linkTitles: ['感想A', '感想B'],
    nextTitle: '浮雲',
  };

  it('件数を見出しに書く', () => {
    expect(buildMonthlyRoundupPostText(roundup)).toContain(
      '今月の1本『ハウスメイド』(2010)、観た人の記事・ポストは2件',
    );
  });

  it('記事・ポストのタイトルを箇条書きにする', () => {
    const text = buildMonthlyRoundupPostText(roundup);

    expect(text).toContain('・感想A');
    expect(text).toContain('・感想B');
  });

  it('タイトルは3件までにする', () => {
    const text = buildMonthlyRoundupPostText({
      ...roundup,
      linkTitles: ['A', 'B', 'C', 'D'],
    });

    expect(text).toContain('・C');
    expect(text).not.toContain('・D');
    expect(text).toContain('観た人の記事・ポストは4件');
  });

  it('件数が0ならその旨を書く', () => {
    const text = buildMonthlyRoundupPostText({...roundup, linkTitles: []});

    expect(text).toContain('観た人の記事・ポストはまだありません。');
    expect(text).not.toMatch(/^・/m);
  });

  it('来月の1本を予告する', () => {
    expect(buildMonthlyRoundupPostText(roundup)).toContain(
      '来月の1本は『浮雲』。明日から。',
    );
  });

  it('来月の1本が取れなければ予告を出さない', () => {
    const text = buildMonthlyRoundupPostText({
      ...roundup,
      nextTitle: undefined,
    });

    expect(text).not.toContain('来月の1本');
  });

  const longLinkTitles = [
    '『ハウスメイド』を観て、住み込みで働くということ、雇う側と雇われる側のあいだにある距離について考えたこと',
    'ハウスメイド 感想 — 階段のある家がそのまま階級の図になっていて、上下の移動がぜんぶ物語に見えてくる話',
    '2010年のベスト映画をふりかえる（後編）ハウスメイド・冬の小鳥・息もできない・ほか10本をまとめて',
  ];

  it('X の本文は裸の URL で終わる', () => {
    const text = buildMonthlyRoundupXPostText({
      ...roundup,
      url: 'https://shine-film.com/movies/abc',
    });

    expect(text).toMatch(/shine-film\.com\/movies\/abc$/);
  });

  it('X もタイトルが長くて切り詰められたら予告を残す', () => {
    const text = buildMonthlyRoundupXPostText({
      ...roundup,
      linkTitles: longLinkTitles,
      url: 'https://shine-film.com/movies/abc',
    });

    expect(text).toContain('来月の1本は『浮雲』。明日から。');
  });
});

describe('buildMonthlyLinksPostText', () => {
  it('件数と映画名だけを伝え、投稿の本文は載せない', () => {
    const text = buildMonthlyLinksPostText({
      title: 'ある映画',
      year: 2020,
      count: 2,
    });

    expect(text).toContain('今月の1本『ある映画』(2020)');
    expect(text).toContain('2件');
    expect(text).toContain('#青空映画部');
  });

  it('X用は本文の後ろにURLを置く', () => {
    const text = buildMonthlyLinksXPostText({
      title: 'ある映画',
      year: 2020,
      count: 1,
      url: 'https://shine-film.com/movies/movie-1',
    });

    expect(text).toContain('shine-film.com/movies/movie-1');
    expect(text).not.toContain('#青空映画部');
  });
});
