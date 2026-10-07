import {describe, expect, it} from 'vitest';
import {arrayBufferToDataUri, buildFontCssUrl, extractFontUrl} from './assets';

describe('buildFontCssUrl', () => {
  it('familyとweightとtextを含むGoogle FontsのURLを作る', () => {
    const url = buildFontCssUrl('Noto Sans JP', 700, '椿姫');

    expect(url).toContain('family=Noto+Sans+JP:wght@700');
    expect(url).toContain(`text=${encodeURIComponent('椿姫')}`);
  });

  it('textの重複文字を取り除いてサブセットを小さくする', () => {
    const url = buildFontCssUrl('Noto Sans JP', 700, 'ああああいい');

    expect(url).toContain(`text=${encodeURIComponent('あい')}`);
  });
});

describe('extractFontUrl', () => {
  it('CSSからtruetypeのURLを取り出す', () => {
    const css = `@font-face {
  font-family: 'Noto Sans JP';
  src: url(https://fonts.gstatic.com/l/font?kit=abc) format('truetype');
}`;

    expect(extractFontUrl(css)).toBe(
      'https://fonts.gstatic.com/l/font?kit=abc',
    );
  });

  it('URLが見つからなければundefinedを返す', () => {
    expect(extractFontUrl('body { color: red; }')).toBeUndefined();
  });
});

describe('arrayBufferToDataUri', () => {
  it('バイト列をbase64のdata URIへ変換する', () => {
    const bytes = new TextEncoder().encode('abc');

    expect(arrayBufferToDataUri(bytes.buffer, 'image/jpeg')).toBe(
      `data:image/jpeg;base64,${btoa('abc')}`,
    );
  });

  it('大きなバッファでもスタックを溢れさせない', () => {
    const large = new Uint8Array(300_000).fill(65);

    expect(() =>
      arrayBufferToDataUri(large.buffer, 'image/jpeg'),
    ).not.toThrow();
  });
});
