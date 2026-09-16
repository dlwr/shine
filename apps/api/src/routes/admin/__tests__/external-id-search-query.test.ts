import {describe, expect, it} from 'vitest';
import {parseExternalIdSearchQuery} from '../external-id-search-query';

describe('parseExternalIdSearchQuery', () => {
  it('query は sanitize して渡す', () => {
    expect(parseExternalIdSearchQuery({query: ' 七人の<侍> '})).toEqual({
      ok: true,
      options: {query: '七人の侍'},
    });
  });

  it('language は ja 系を ja-JP、en 系を en-US に寄せ、他は捨てる', () => {
    expect(parseExternalIdSearchQuery({language: 'ja'})).toEqual({
      ok: true,
      options: {language: 'ja-JP'},
    });
    expect(parseExternalIdSearchQuery({language: 'EN-GB'})).toEqual({
      ok: true,
      options: {language: 'en-US'},
    });
    expect(parseExternalIdSearchQuery({language: 'fr'})).toEqual({
      ok: true,
      options: {},
    });
  });

  it('year と limit は数値にする', () => {
    expect(parseExternalIdSearchQuery({year: '1954', limit: '5'})).toEqual({
      ok: true,
      options: {year: 1954, limit: 5},
    });
  });

  it('数値でない year は弾く', () => {
    expect(parseExternalIdSearchQuery({year: 'abc'})).toEqual({
      ok: false,
      error: 'Invalid year parameter',
    });
  });

  it('1 未満か数値でない limit は弾く', () => {
    expect(parseExternalIdSearchQuery({limit: '0'})).toEqual({
      ok: false,
      error: 'Invalid limit parameter',
    });
    expect(parseExternalIdSearchQuery({limit: 'x'})).toEqual({
      ok: false,
      error: 'Invalid limit parameter',
    });
  });
});
