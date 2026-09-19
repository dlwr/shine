import {describe, expect, it} from 'vitest';
import {publicationYearFromClaims} from '../wikidata-film-resolver';

describe('publicationYearFromClaims', () => {
  it('P577から公開年を取り出す', () => {
    const claims = {
      P577: [{mainsnak: {datavalue: {value: {time: '+1959-11-01T00:00:00Z'}}}}],
    };

    expect(publicationYearFromClaims(claims)).toBe(1959);
  });

  it('公開日が複数ある場合は最も早い年を採る', () => {
    const claims = {
      P577: [
        {mainsnak: {datavalue: {value: {time: '+1960-03-01T00:00:00Z'}}}},
        {mainsnak: {datavalue: {value: {time: '+1959-11-01T00:00:00Z'}}}},
      ],
    };

    expect(publicationYearFromClaims(claims)).toBe(1959);
  });

  it('P577が無ければundefinedを返す', () => {
    expect(publicationYearFromClaims({P345: []})).toBeUndefined();
  });

  it('claims自体が無ければundefinedを返す', () => {
    expect(publicationYearFromClaims(undefined)).toBeUndefined();
  });

  it('紀元前のように先頭が+でない日付は読まない', () => {
    const claims = {
      P577: [{mainsnak: {datavalue: {value: {time: '-0044-03-15T00:00:00Z'}}}}],
    };

    expect(publicationYearFromClaims(claims)).toBeUndefined();
  });

  it('timeが文字列でない主張は飛ばして残りから採る', () => {
    const claims = {
      P577: [
        {mainsnak: {datavalue: {value: {time: 1959}}}},
        {mainsnak: {datavalue: {value: {time: '+1960-03-01T00:00:00Z'}}}},
      ],
    };

    expect(publicationYearFromClaims(claims)).toBe(1960);
  });
});
