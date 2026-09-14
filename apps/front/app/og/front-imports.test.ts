import {describe, expect, it} from 'vitest';

const frontSources = {
  ...import.meta.glob<string>('../**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob<string>('../../workers/app.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
};

const OG_RENDERER_IMPORT = /from\s+'(?:@\/og\/(?!paths')|\.\.?\/og\/)[^']*'/;

describe('front worker の読み込み', () => {
  it('OG 画像の描画コードは OG worker だけが読み込む', () => {
    const importers = Object.entries(frontSources)
      .filter(
        ([file, source]) =>
          !file.startsWith('../og/') &&
          !/\.test\.tsx?$/.test(file) &&
          OG_RENDERER_IMPORT.test(source),
      )
      .map(([file]) => file);

    expect(importers).toEqual([]);
  });
});
