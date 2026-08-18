import {describe, expect, it} from 'vitest';
import {selectMoviesNeedingJapaneseTitle} from './select-targets';

const movie = (uid: string) => ({
  uid,
  imdbId: `tt${uid}`,
  englishTitle: `Title ${uid}`,
  year: 2000,
  tmdbId: undefined,
});

const candidates = [movie('a'), movie('b'), movie('c')];

const existing = [
  {movieUid: 'b', content: '恋人たち'},
  {movieUid: 'c', content: 'Pather Panchali'},
];

describe('selectMoviesNeedingJapaneseTitle', () => {
  it('ja翻訳が無い映画は対象になる', () => {
    const result = selectMoviesNeedingJapaneseTitle(candidates, existing, {
      shouldIncludeNonJapanese: false,
    });

    expect(result.map(m => m.uid)).toContain('a');
  });

  it('日本語文字を含むja翻訳がある映画は対象外', () => {
    const result = selectMoviesNeedingJapaneseTitle(candidates, existing, {
      shouldIncludeNonJapanese: false,
    });

    expect(result.map(m => m.uid)).not.toContain('b');
  });

  it('既定では英字のみのja翻訳がある映画は対象外', () => {
    const result = selectMoviesNeedingJapaneseTitle(candidates, existing, {
      shouldIncludeNonJapanese: false,
    });

    expect(result.map(m => m.uid)).not.toContain('c');
  });

  it('includeNonJapaneseを指定すると英字のみのja翻訳がある映画も対象になる', () => {
    const result = selectMoviesNeedingJapaneseTitle(candidates, existing, {
      shouldIncludeNonJapanese: true,
    });

    expect(result.map(m => m.uid)).toContain('c');
  });

  it('includeNonJapaneseを指定しても日本語文字を含む映画は対象外のまま', () => {
    const result = selectMoviesNeedingJapaneseTitle(candidates, existing, {
      shouldIncludeNonJapanese: true,
    });

    expect(result.map(m => m.uid)).not.toContain('b');
  });

  it('カタカナのみのja翻訳は日本語として扱い対象外にする', () => {
    const result = selectMoviesNeedingJapaneseTitle(
      [movie('d')],
      [{movieUid: 'd', content: 'ランド・オブ・ザ・デッド'}],
      {shouldIncludeNonJapanese: true},
    );

    expect(result).toHaveLength(0);
  });

  it('記号混じりでも日本語文字を含めば対象外にする', () => {
    const result = selectMoviesNeedingJapaneseTitle(
      [movie('e')],
      [{movieUid: 'e', content: 'M/OTHER 大河のうた'}],
      {shouldIncludeNonJapanese: true},
    );

    expect(result).toHaveLength(0);
  });
});
