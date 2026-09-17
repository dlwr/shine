import {describe, expect, it} from 'vitest';
import {
  deleteTranslationRequest,
  hasRequiredTranslationFields,
  saveTranslationRequest,
} from './translation-requests';

const values = {languageCode: 'en', content: 'Rashomon', isDefault: false};

describe('hasRequiredTranslationFields', () => {
  it('言語コードとタイトルがあれば true', () => {
    expect(hasRequiredTranslationFields(values)).toBe(true);
  });

  it('タイトルが空白だけなら false', () => {
    expect(hasRequiredTranslationFields({...values, content: '  '})).toBe(
      false,
    );
  });

  it('言語コードが空なら false', () => {
    expect(hasRequiredTranslationFields({...values, languageCode: ''})).toBe(
      false,
    );
  });
});

describe('saveTranslationRequest', () => {
  it('映画の翻訳 API に POST する', () => {
    const {url, init} = saveTranslationRequest(
      'https://api.test',
      'movie-1',
      values,
    );

    expect([url, init.method]).toEqual([
      'https://api.test/movies/movie-1/translations',
      'POST',
    ]);
  });

  it('言語コードとタイトルの前後の空白を落とす', () => {
    const {init} = saveTranslationRequest('https://api.test', 'movie-1', {
      languageCode: ' en ',
      content: ' Rashomon ',
      isDefault: true,
    });

    expect(JSON.parse(init.body as string)).toEqual({
      languageCode: 'en',
      content: 'Rashomon',
      isDefault: true,
    });
  });
});

describe('deleteTranslationRequest', () => {
  it('言語コードを指定して DELETE する', () => {
    const {url, init} = deleteTranslationRequest(
      'https://api.test',
      'movie-1',
      'ja',
    );

    expect([url, init.method]).toEqual([
      'https://api.test/movies/movie-1/translations/ja',
      'DELETE',
    ]);
  });
});
