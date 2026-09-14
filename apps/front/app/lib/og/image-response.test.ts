import {describe, expect, it} from 'vitest';

const sources = import.meta.glob<string>('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const STATIC_IMPORT = /^import\s+(?!type\s)[^;]*?from\s+'workers-og';/m;

describe('workers-og の読み込み', () => {
  it('OG 画像を描くときだけ読み込み、ページの描画で wasm を評価しない', () => {
    const staticImporters = Object.entries(sources)
      .filter(
        ([file, source]) =>
          !/\.test\.tsx?$/.test(file) && STATIC_IMPORT.test(source),
      )
      .map(([file]) => file);

    expect(staticImporters).toEqual([]);
  });
});
