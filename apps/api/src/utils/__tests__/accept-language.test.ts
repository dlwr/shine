import {describe, expect, it} from 'vitest';
import {parseAcceptLanguage} from '../accept-language';

describe('parseAcceptLanguage', () => {
  it('ヘッダが無ければ空', () => {
    expect(parseAcceptLanguage(undefined)).toEqual([]);
  });

  it('地域を落として言語コードだけにする', () => {
    expect(parseAcceptLanguage('ja-JP')).toEqual(['ja']);
  });

  it('q の高い順に並べる', () => {
    expect(parseAcceptLanguage('en;q=0.5,ja-JP;q=0.9,fr')).toEqual([
      'fr',
      'ja',
      'en',
    ]);
  });

  it('q が同じなら書かれた順を保つ', () => {
    expect(parseAcceptLanguage('de;q=0.8,en;q=0.8,ja;q=0.8')).toEqual([
      'de',
      'en',
      'ja',
    ]);
  });
});
