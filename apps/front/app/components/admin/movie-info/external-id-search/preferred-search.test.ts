import {describe, expect, it} from 'vitest';
import {preferredSearchFor} from './preferred-search';

describe('preferredSearchFor', () => {
  it('日本語題があれば日本語で検索する', () => {
    expect(
      preferredSearchFor([
        {languageCode: 'en', content: 'Seven Samurai'},
        {languageCode: 'ja', content: ' 七人の侍 '},
      ]),
    ).toEqual({text: '七人の侍', language: 'ja-JP'});
  });

  it('日本語題が無ければ英語題で検索する', () => {
    expect(
      preferredSearchFor([
        {languageCode: 'fr', content: 'Les Sept Samouraïs'},
        {languageCode: 'en', content: 'Seven Samurai'},
      ]),
    ).toEqual({text: 'Seven Samurai', language: 'en-US'});
  });

  it('空白だけの題は飛ばす', () => {
    expect(
      preferredSearchFor([
        {languageCode: 'ja', content: ' '.repeat(3)},
        {languageCode: 'en', content: 'Seven Samurai'},
      ]),
    ).toEqual({text: 'Seven Samurai', language: 'en-US'});
  });

  it('日本語も英語も無ければ最初の題を英語として検索する', () => {
    expect(
      preferredSearchFor([{languageCode: 'fr', content: 'Les Sept Samouraïs'}]),
    ).toEqual({text: 'Les Sept Samouraïs', language: 'en-US'});
  });

  it('題が無ければ空の日本語検索にする', () => {
    expect(preferredSearchFor(undefined)).toEqual({
      text: '',
      language: 'ja-JP',
    });
  });
});
