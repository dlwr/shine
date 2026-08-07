import {describe, expect, it} from 'vitest';
import {buildDailyPostText, buildXPostText, xWeightedLength} from './post-text';

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

  it('本文の末尾にURLを含む', () => {
    const text = buildXPostText(xBase);

    expect(text).toMatch(/https:\/\/shine-film\.com\/movies\/abc-123$/);
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

  it('長いタイトルでも本文のweighted長がURL込み280以内に収まる', () => {
    const text = buildXPostText({
      ...xBase,
      title: 'あ'.repeat(300),
    });

    const withoutUrl = text.replace(/\nhttps:\/\/\S+$/, '');
    expect(xWeightedLength(withoutUrl) + 1 + 23).toBeLessThanOrEqual(280);
    expect(text).toMatch(/https:\/\/shine-film\.com\/movies\/abc-123$/);
  });
});
