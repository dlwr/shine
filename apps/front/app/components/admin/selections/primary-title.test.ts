import {describe, expect, it} from 'vitest';
import {getPrimaryTitle} from './primary-title';

describe('getPrimaryTitle', () => {
  it('title があればそれを返す', () => {
    expect(getPrimaryTitle({uid: 'm', title: '七人の侍', year: 1954})).toBe(
      '七人の侍',
    );
  });

  it('翻訳は既定の行を優先する', () => {
    expect(
      getPrimaryTitle({
        uid: 'm',
        year: 1954,
        nominations: [],
        translations: [
          {languageCode: 'ja', content: '七人の侍', isDefault: 0},
          {languageCode: 'en', content: 'Seven Samurai', isDefault: 1},
        ],
      }),
    ).toBe('Seven Samurai');
  });

  it('既定の行が無ければ日本語、それも無ければ最初の行', () => {
    expect(
      getPrimaryTitle({
        uid: 'm',
        year: 1954,
        nominations: [],
        translations: [
          {languageCode: 'fr', content: 'Les Sept Samouraïs', isDefault: 0},
          {languageCode: 'ja', content: '七人の侍', isDefault: 0},
        ],
      }),
    ).toBe('七人の侍');
    expect(
      getPrimaryTitle({
        uid: 'm',
        year: 1954,
        nominations: [],
        translations: [
          {languageCode: 'fr', content: 'Les Sept Samouraïs', isDefault: 0},
        ],
      }),
    ).toBe('Les Sept Samouraïs');
  });

  it('映画が無ければ無題', () => {
    expect(getPrimaryTitle(undefined)).toBe('無題');
  });
});
