import {describe, expect, it} from 'vitest';
import {
  hasJapaneseText,
  normalizeTitle,
  matchesTitle,
  matchesTitleAsVolume,
} from '../title-match';

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

describe('matchesTitle', () => {
  it('matches identical normalized titles', () => {
    expect(matchesTitle('ゴッドファーザー', ['ゴッドファーザー'])).toBe(true);
  });

  it('matches across media/edition decorations and spacing differences', () => {
    expect(
      matchesTitle('【Blu-ray】ゴッドファーザー PARTI デジタル・リストア版', [
        'ゴッドファーザー PART I',
      ]),
    ).toBe(true);
  });

  it('matches any of multiple target titles', () => {
    expect(
      matchesTitle('The Godfather', ['ゴッドファーザー', 'the godfather']),
    ).toBe(true);
  });

  it('does not match a different movie containing the title as substring', () => {
    expect(matchesTitle('東京ゴッドファーザーズ', ['ゴッドファーザー'])).toBe(
      false,
    );
  });

  it('does not match sequels', () => {
    expect(matchesTitle('ゴッドファーザー PART II', ['ゴッドファーザー'])).toBe(
      false,
    );
  });

  it('ignores empty target titles', () => {
    expect(matchesTitle('ゴッドファーザー', ['', '  '])).toBe(false);
  });

  it('matches a parenthesized alternate title', () => {
    expect(
      matchesTitle('ブードゥリアン（私はゾンビと歩いた！）', [
        '私はゾンビと歩いた',
      ]),
    ).toBe(true);
  });

  it('matches the part outside parentheses', () => {
    expect(
      matchesTitle('ブードゥリアン（私はゾンビと歩いた！）', [
        'ブードゥリアン',
      ]),
    ).toBe(true);
  });

  it('ignores a trailing exclamation mark difference', () => {
    expect(matchesTitle('私はゾンビと歩いた！', ['私はゾンビと歩いた'])).toBe(
      true,
    );
  });

  it('does not match a different title inside parentheses', () => {
    expect(
      matchesTitle('ブードゥリアン（私はゾンビと歩いた！）', [
        'ゾンビと歩いた',
      ]),
    ).toBe(false);
  });

  it('matches a title decorated with a double angle bracket edition', () => {
    expect(
      matchesTitle('エルミタージュ幻想《ニューマスター版》', [
        'エルミタージュ幻想',
      ]),
    ).toBe(true);
  });

  it('does not match a different film named inside double angle brackets', () => {
    expect(matchesTitle('無防備都市《ローマ》', ['ローマ'])).toBe(false);
  });

  it('does not match a volume of a split release', () => {
    expect(
      matchesTitle('愛と宿命の泉　１　フロレット家のジャン', ['愛と宿命の泉']),
    ).toBe(false);
  });
});

describe('matchesTitleAsVolume', () => {
  it('matches a volume numbered with a full-width digit', () => {
    expect(
      matchesTitleAsVolume('愛と宿命の泉　１　フロレット家のジャン', [
        '愛と宿命の泉',
      ]),
    ).toBe(true);
  });

  it('matches a volume numbered with 第N部', () => {
    expect(
      matchesTitleAsVolume('愛と宿命の泉 第2部 泉のマノン', ['愛と宿命の泉']),
    ).toBe(true);
  });

  it('matches a volume labelled 前編', () => {
    expect(matchesTitleAsVolume('人間の條件 前編 純愛篇', ['人間の條件'])).toBe(
      true,
    );
  });

  it('does not match a sequel without a subtitle', () => {
    expect(
      matchesTitleAsVolume('ゴッドファーザー PART II', ['ゴッドファーザー']),
    ).toBe(false);
  });

  it('does not match a numbered sequel without a subtitle', () => {
    expect(matchesTitleAsVolume('ロッキー 3', ['ロッキー'])).toBe(false);
  });

  it('does not match an exact title', () => {
    expect(matchesTitleAsVolume('愛と宿命の泉', ['愛と宿命の泉'])).toBe(false);
  });

  it('does not match a different film sharing a prefix', () => {
    expect(
      matchesTitleAsVolume('東京ゴッドファーザーズ 1 番外編', [
        'ゴッドファーザー',
      ]),
    ).toBe(false);
  });

  it('ignores empty target titles', () => {
    expect(
      matchesTitleAsVolume('愛と宿命の泉　１　フロレット家のジャン', ['', ' ']),
    ).toBe(false);
  });
});
