import {describe, expect, it} from 'vitest';
import {buildDailyPostText} from './post-text';

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
});
