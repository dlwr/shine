import {describe, expect, test} from 'vitest';
import {getLocaleFromRequest} from './locale';

function createRequest(url: string, acceptLanguage?: string) {
  return new Request(
    url,
    acceptLanguage ? {headers: {'accept-language': acceptLanguage}} : undefined,
  );
}

describe('getLocaleFromRequest', () => {
  test('localeクエリがjaならjaを返す', () => {
    const request = createRequest('https://shine-film.com/?locale=ja', 'en');

    expect(getLocaleFromRequest(request)).toBe('ja');
  });

  test('localeクエリがenならenを返す', () => {
    const request = createRequest('https://shine-film.com/?locale=en', 'ja');

    expect(getLocaleFromRequest(request)).toBe('en');
  });

  test('対応していないlocaleクエリは無視する', () => {
    const request = createRequest('https://shine-film.com/?locale=fr', 'en');

    expect(getLocaleFromRequest(request)).toBe('en');
  });

  test('localeクエリがなければAccept-Languageを見る', () => {
    const request = createRequest(
      'https://shine-film.com/',
      'en-US,en;q=0.9,ja;q=0.8',
    );

    expect(getLocaleFromRequest(request)).toBe('en');
  });

  test('Accept-Languageの地域コード付きja-JPをjaとして扱う', () => {
    const request = createRequest('https://shine-film.com/', 'ja-JP,ja;q=0.9');

    expect(getLocaleFromRequest(request)).toBe('ja');
  });

  test('Accept-Languageに対応言語がなければjaを返す', () => {
    const request = createRequest('https://shine-film.com/', 'fr-FR,fr;q=0.9');

    expect(getLocaleFromRequest(request)).toBe('ja');
  });

  test('Accept-Languageヘッダーがなければjaを返す', () => {
    const request = createRequest('https://shine-film.com/');

    expect(getLocaleFromRequest(request)).toBe('ja');
  });
});
