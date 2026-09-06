import {describe, expect, it} from 'vitest';
import {hasOnlyLatinOrJapaneseScript} from './person-name-script';

describe('hasOnlyLatinOrJapaneseScript', () => {
  it.each([
    'Rachel Szor',
    'Léa Seydoux',
    'Ólafur Darri Ólafsson',
    'Song Kang-ho',
    '是枝裕和',
    'ソン・ガンホ',
    '王兵',
    "Anna O'Brien Jr.",
  ])('%s はラテン文字か日本語だけ', name => {
    expect(hasOnlyLatinOrJapaneseScript(name)).toBe(true);
  });

  it.each([
    'רחל שור',
    '송강호',
    'Александр Филиппенко',
    'Άννα Κυριακού',
    'سعید روستایی',
    'ชาญชนะ',
    'Rachel שור',
  ])('%s はそれ以外の文字を含む', name => {
    expect(hasOnlyLatinOrJapaneseScript(name)).toBe(false);
  });
});
