import {describe, expect, it} from 'vitest';
import {bigramPhrase} from '../search-terms';

describe('bigramPhrase', () => {
  it('隣り合う2文字を空白区切りで並べたフレーズにする', () => {
    expect(bigramPhrase('役所広司')).toBe('"役所 所広 広司"');
  });

  it('2文字ならその2文字だけのフレーズにする', () => {
    expect(bigramPhrase('黒澤')).toBe('"黒澤"');
  });

  it('空白も1文字として数える', () => {
    expect(bigramPhrase('m H')).toBe('"m   H"');
  });

  it('二重引用符は重ねてエスケープする', () => {
    expect(bigramPhrase('a"b')).toBe('"a"" ""b"');
  });

  it('サロゲートペアの文字を1文字として数える', () => {
    expect(bigramPhrase('𠮷野家')).toBe('"𠮷野 野家"');
  });

  it('1文字なら undefined を返す', () => {
    expect(bigramPhrase('ザ')).toBeUndefined();
  });

  it('サロゲートペアの1文字なら undefined を返す', () => {
    expect(bigramPhrase('𠮷')).toBeUndefined();
  });

  it('空文字なら undefined を返す', () => {
    expect(bigramPhrase('')).toBeUndefined();
  });
});
