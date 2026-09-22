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
const API_IMPORT = /^import\s+(type\s+)?[^;]*?from\s+'@shine\/api\/[^']*'/gm;

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

  it('API の型は lib/api-types.ts だけが import type で読み込む', () => {
    const offenders = Object.entries(frontSources).flatMap(([file, source]) =>
      source
        .matchAll(API_IMPORT)
        .filter(([, typeOnly]) => file !== '../lib/api-types.ts' || !typeOnly)
        .map(([statement]) => `${file}: ${statement}`)
        .toArray(),
    );

    expect(offenders).toEqual([]);
  });
});
