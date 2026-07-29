import {describe, expect, it} from 'vitest';
import {isValidImdbId} from './imdb-id';

describe('isValidImdbId', () => {
  it('tt から始まる7桁以上の数字を有効とする', () => {
    expect(isValidImdbId('tt0418819')).toBe(true);
  });

  it('8桁のIMDb IDも有効とする', () => {
    expect(isValidImdbId('tt12345678')).toBe(true);
  });

  it('undefinedを無効とする', () => {
    expect(isValidImdbId(undefined as unknown)).toBe(false);
  });

  it('nullを無効とする', () => {
    // eslint-disable-next-line unicorn/no-null
    expect(isValidImdbId(null)).toBe(false);
  });

  it('文字列のnullを無効とする', () => {
    expect(isValidImdbId('null')).toBe(false);
  });

  it('空文字を無効とする', () => {
    expect(isValidImdbId('')).toBe(false);
  });

  it('tt が付かない数字だけの値を無効とする', () => {
    expect(isValidImdbId('0418819')).toBe(false);
  });

  it('桁数が足りない値を無効とする', () => {
    expect(isValidImdbId('tt123')).toBe(false);
  });
});
