import {describe, expect, it} from 'vitest';
import {hasJapaneseText, normalizeTitle, titleMatches} from '../title-match';

describe('hasJapaneseText', () => {
  it('detects katakana', () => {
    expect(hasJapaneseText('アモーレス・ペロス')).toBe(true);
  });

  it('detects hiragana', () => {
    expect(hasJapaneseText('となりのトトロ')).toBe(true);
  });

  it('detects kanji', () => {
    expect(hasJapaneseText('七人の侍')).toBe(true);
  });

  it('returns false for Latin-only text', () => {
    expect(hasJapaneseText('Amores perros')).toBe(false);
  });

  it('returns false for empty text', () => {
    expect(hasJapaneseText('')).toBe(false);
  });
});

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

  it('matches a parenthesized alternate title', () => {
    expect(
      titleMatches('ブードゥリアン（私はゾンビと歩いた！）', [
        '私はゾンビと歩いた',
      ]),
    ).toBe(true);
  });

  it('matches the part outside parentheses', () => {
    expect(
      titleMatches('ブードゥリアン（私はゾンビと歩いた！）', [
        'ブードゥリアン',
      ]),
    ).toBe(true);
  });

  it('ignores a trailing exclamation mark difference', () => {
    expect(titleMatches('私はゾンビと歩いた！', ['私はゾンビと歩いた'])).toBe(
      true,
    );
  });

  it('does not match a different title inside parentheses', () => {
    expect(
      titleMatches('ブードゥリアン（私はゾンビと歩いた！）', [
        'ゾンビと歩いた',
      ]),
    ).toBe(false);
  });

  it('matches a title decorated with a double angle bracket edition', () => {
    expect(
      titleMatches('エルミタージュ幻想《ニューマスター版》', [
        'エルミタージュ幻想',
      ]),
    ).toBe(true);
  });

  it('matches the content inside double angle brackets', () => {
    expect(titleMatches('無防備都市《ローマ》', ['ローマ'])).toBe(true);
  });
});
