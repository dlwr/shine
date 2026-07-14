import {describe, expect, it} from 'vitest';
import {normalizeTitle, titleMatches} from '../title-match';

describe('normalizeTitle', () => {
  it('lowercases and trims', () => {
    expect(normalizeTitle('  The Godfather  ')).toBe('the godfather');
  });

  it('converts full-width alphanumerics to half-width', () => {
    expect(normalizeTitle('ゴッドファーザー　ＰＡＲＴ　ＩＩ')).toBe(
      'ゴッドファーザー part ii',
    );
  });

  it('strips leading bracket annotations like 【Blu-ray】', () => {
    expect(normalizeTitle('【Blu-ray】ゴッドファーザー')).toBe(
      'ゴッドファーザー',
    );
  });

  it('strips trailing angle-bracket annotations', () => {
    expect(normalizeTitle('ゴッドファーザー ＜デジタル・リストア版＞')).toBe(
      'ゴッドファーザー',
    );
  });

  it('normalizes interpunct and slash separators to spaces', () => {
    expect(normalizeTitle('ジ・オファー／ゴッドファーザーに賭けた男')).toBe(
      normalizeTitle('ジ オファー / ゴッドファーザーに賭けた男'),
    );
  });

  it('collapses consecutive spaces', () => {
    expect(normalizeTitle('東京   ゴッドファーザーズ')).toBe(
      '東京 ゴッドファーザーズ',
    );
  });
});

describe('titleMatches', () => {
  it('matches identical normalized titles', () => {
    expect(titleMatches('ゴッドファーザー', ['ゴッドファーザー'])).toBe(true);
  });

  it('matches across media/edition decorations and spacing differences', () => {
    expect(
      titleMatches('【Blu-ray】ゴッドファーザー PARTI デジタル・リストア版', [
        'ゴッドファーザー PART I',
      ]),
    ).toBe(true);
  });

  it('matches any of multiple target titles', () => {
    expect(
      titleMatches('The Godfather', ['ゴッドファーザー', 'the godfather']),
    ).toBe(true);
  });

  it('does not match a different movie containing the title as substring', () => {
    expect(titleMatches('東京ゴッドファーザーズ', ['ゴッドファーザー'])).toBe(
      false,
    );
  });

  it('does not match sequels', () => {
    expect(titleMatches('ゴッドファーザー PART II', ['ゴッドファーザー'])).toBe(
      false,
    );
  });

  it('ignores empty target titles', () => {
    expect(titleMatches('ゴッドファーザー', ['', '  '])).toBe(false);
  });
});
