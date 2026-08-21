import {describe, expect, it} from 'vitest';
import {withDefaultTranslationFlags} from '../default-translations';

function title(languageCode: string) {
  return {
    resourceType: 'movie_title',
    resourceUid: 'movie-1',
    languageCode,
    content: `${languageCode} title`,
  };
}

function description(languageCode: string) {
  return {
    resourceType: 'movie_description',
    resourceUid: 'movie-1',
    languageCode,
    content: `${languageCode} description`,
  };
}

describe('withDefaultTranslationFlags', () => {
  it('日本語映画では日本語タイトルがデフォルトになる', () => {
    const rows = withDefaultTranslationFlags('ja', [title('en'), title('ja')]);
    expect(rows).toEqual([
      expect.objectContaining({languageCode: 'en', isDefault: 0}),
      expect.objectContaining({languageCode: 'ja', isDefault: 1}),
    ]);
  });

  it('英語映画では英語タイトルがデフォルトになる', () => {
    const rows = withDefaultTranslationFlags('en', [title('en'), title('ja')]);
    expect(rows).toEqual([
      expect.objectContaining({languageCode: 'en', isDefault: 1}),
      expect.objectContaining({languageCode: 'ja', isDefault: 0}),
    ]);
  });

  it('原語タイトルが無い映画では英語タイトルがデフォルトになる', () => {
    const rows = withDefaultTranslationFlags('fr', [title('en'), title('ja')]);
    expect(rows).toEqual([
      expect.objectContaining({languageCode: 'en', isDefault: 1}),
      expect.objectContaining({languageCode: 'ja', isDefault: 0}),
    ]);
  });

  it('原語も英語も無ければ先頭の行がデフォルトになる', () => {
    const rows = withDefaultTranslationFlags('fr', [title('ja'), title('it')]);
    expect(rows).toEqual([
      expect.objectContaining({languageCode: 'ja', isDefault: 1}),
      expect.objectContaining({languageCode: 'it', isDefault: 0}),
    ]);
  });

  it('resourceTypeごとに独立してデフォルトを決める', () => {
    const rows = withDefaultTranslationFlags('ja', [
      title('en'),
      title('ja'),
      description('en'),
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        resourceType: 'movie_title',
        languageCode: 'en',
        isDefault: 0,
      }),
      expect.objectContaining({
        resourceType: 'movie_title',
        languageCode: 'ja',
        isDefault: 1,
      }),
      expect.objectContaining({
        resourceType: 'movie_description',
        languageCode: 'en',
        isDefault: 1,
      }),
    ]);
  });
});
