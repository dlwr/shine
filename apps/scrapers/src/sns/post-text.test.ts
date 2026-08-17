import {describe, expect, it} from 'vitest';
import {
  buildDailyPostText,
  buildQuizPostText,
  buildQuizShareUrl,
  buildQuizXPostText,
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
