import {describe, expect, it} from 'vitest';
import {languageName} from './languages';

describe('languageName', () => {
  it('言語コードを日本語の言語名にする', () => {
    expect(languageName('fa')).toBe('ペルシア語');
  });

  it('TMDb 独自の cn を広東語にする', () => {
    expect(languageName('cn')).toBe('広東語');
  });

  it('TMDb の xx を言語なしにする', () => {
    expect(languageName('xx')).toBe('言語なし');
  });
});
