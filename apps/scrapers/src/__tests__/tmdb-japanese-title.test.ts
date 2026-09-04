import {describe, expect, it} from 'vitest';
import {pickJapaneseTitle} from '../common/tmdb-japanese-title';

describe('pickJapaneseTitle', () => {
  it('日本語訳があればそのタイトルを返す', () => {
    expect(
      pickJapaneseTitle({
        title: 'ゴーン・ウィズ・ザ・ブレッツ',
        original_title: '一步之遥',
        original_language: 'zh',
      }),
    ).toBe('ゴーン・ウィズ・ザ・ブレッツ');
  });

  it('ラテン文字の邦題も原題と違えば返す', () => {
    expect(
      pickJapaneseTitle({
        title: 'HERO',
        original_title: '英雄',
        original_language: 'zh',
      }),
    ).toBe('HERO');
  });

  it('原題フォールバックは邦題として扱わない', () => {
    expect(
      pickJapaneseTitle({
        title: 'کمی نور',
        original_title: 'کمی نور',
        original_language: 'fa',
      }),
    ).toBeUndefined();
  });

  it('漢字だけの中国語原題フォールバックも邦題として扱わない', () => {
    expect(
      pickJapaneseTitle({
        title: '一步之遥',
        original_title: '一步之遥',
        original_language: 'zh',
      }),
    ).toBeUndefined();
  });

  it('原語が日本語なら原題と同じでも返す', () => {
    expect(
      pickJapaneseTitle({
        title: '羅生門',
        original_title: '羅生門',
        original_language: 'ja',
      }),
    ).toBe('羅生門');
  });

  it('原語が日本語でも日本語文字を含まないローマ字は返さない', () => {
    expect(
      pickJapaneseTitle({
        title: 'Rashômon',
        original_title: 'Rashômon',
        original_language: 'ja',
      }),
    ).toBeUndefined();
  });

  it('前後の空白は無視して比較する', () => {
    expect(
      pickJapaneseTitle({
        title: ' Kvinde ukendt ',
        original_title: 'Kvinde ukendt',
        original_language: 'da',
      }),
    ).toBeUndefined();
  });

  it('タイトルが空や未取得なら返さない', () => {
    expect(pickJapaneseTitle(undefined)).toBeUndefined();
    expect(
      pickJapaneseTitle({
        title: '',
        original_title: 'x',
        original_language: 'en',
      }),
    ).toBeUndefined();
  });
});
