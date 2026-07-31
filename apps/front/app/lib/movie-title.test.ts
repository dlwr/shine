import {describe, expect, it} from 'vitest';
import {resolveMovieTitle} from './movie-title';

const translation = (languageCode: string, content: string, isDefault = 0) => ({
  languageCode,
  content,
  isDefault,
});

describe('resolveMovieTitle', () => {
  it('title があればそのまま返す', () => {
    expect(
      resolveMovieTitle({
        title: 'Parasite',
        translations: [translation('ja', 'パラサイト')],
      }),
    ).toBe('Parasite');
  });

  it('title が空白のみの場合は翻訳にフォールバックする', () => {
    expect(
      resolveMovieTitle({
        title: '   ',
        translations: [translation('en', 'Parasite')],
      }),
    ).toBe('Parasite');
  });

  it('locale の言語コードに一致する翻訳を返す', () => {
    expect(
      resolveMovieTitle(
        {
          translations: [
            translation('en', 'Parasite'),
            translation('ja', 'パラサイト'),
          ],
        },
        {locale: 'ja'},
      ),
    ).toBe('パラサイト');
  });

  it('locale が地域付き（ja-JP）でも言語コードで一致する', () => {
    expect(
      resolveMovieTitle(
        {
          translations: [
            translation('en', 'Parasite'),
            translation('ja', 'パラサイト'),
          ],
        },
        {locale: 'ja-JP'},
      ),
    ).toBe('パラサイト');
  });

  it('locale 一致がない場合は isDefault=1 の翻訳を返す', () => {
    expect(
      resolveMovieTitle(
        {
          translations: [
            translation('fr', 'Parasite (FR)'),
            translation('ko', '기생충', 1),
          ],
        },
        {locale: 'ja'},
      ),
    ).toBe('기생충');
  });

  it('locale 一致もデフォルトもない場合は preferredLanguages の順で返す', () => {
    expect(
      resolveMovieTitle(
        {
          translations: [
            translation('fr', 'Parasite (FR)'),
            translation('en', 'Parasite (EN)'),
            translation('ja', 'パラサイト'),
          ],
        },
        {locale: 'de', preferredLanguages: ['ja', 'en']},
      ),
    ).toBe('パラサイト');
  });

  it('preferredLanguages の先頭言語がない場合は次の言語を返す', () => {
    expect(
      resolveMovieTitle(
        {
          translations: [
            translation('fr', 'Parasite (FR)'),
            translation('en', 'Parasite (EN)'),
          ],
        },
        {locale: 'de', preferredLanguages: ['ja', 'en']},
      ),
    ).toBe('Parasite (EN)');
  });

  it('どの条件にも一致しない場合は先頭の翻訳を返す', () => {
    expect(
      resolveMovieTitle(
        {
          translations: [
            translation('fr', 'Parasite (FR)'),
            translation('ko', '기생충'),
          ],
        },
        {locale: 'ja'},
      ),
    ).toBe('Parasite (FR)');
  });

  it('翻訳が空配列の場合は noTranslationsFallback を返す', () => {
    expect(
      resolveMovieTitle(
        {translations: []},
        {fallback: 'Untitled', noTranslationsFallback: 'Unknown Title (2020)'},
      ),
    ).toBe('Unknown Title (2020)');
  });

  it('noTranslationsFallback 未指定で翻訳が無い場合は fallback を返す', () => {
    expect(resolveMovieTitle({}, {fallback: 'タイトル不明'})).toBe(
      'タイトル不明',
    );
  });

  it('翻訳の content がすべて空の場合は fallback を返す', () => {
    expect(
      resolveMovieTitle(
        {translations: [translation('ja', ''), translation('en', '')]},
        {locale: 'ja', fallback: 'タイトル不明'},
      ),
    ).toBe('タイトル不明');
  });

  it('fallback 未指定の場合は Unknown Title を返す', () => {
    expect(resolveMovieTitle({})).toBe('Unknown Title');
  });
});
