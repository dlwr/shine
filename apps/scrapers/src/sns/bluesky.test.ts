import {describe, expect, it} from 'vitest';
import {buildPostRecord, detectTagFacets} from './bluesky';

const base = {
  text: '今日の1本 —『ハウスメイド』(2010)',
  createdAt: '2026-07-31T00:00:00.000Z',
  link: {
    uri: 'https://shine-film.com/movies/abc',
    title: 'ハウスメイド (2010) | なんか見る',
    description: '『ハウスメイド』(2010年)。',
  },
};

describe('buildPostRecord', () => {
  it('app.bsky.feed.postのレコードを作る', () => {
    expect(buildPostRecord(base).$type).toBe('app.bsky.feed.post');
  });

  it('本文とcreatedAtを含む', () => {
    const record = buildPostRecord(base);

    expect(record.text).toBe(base.text);
    expect(record.createdAt).toBe('2026-07-31T00:00:00.000Z');
  });

  it('言語をjaにする', () => {
    expect(buildPostRecord(base).langs).toEqual(['ja']);
  });

  it('リンクを外部埋め込みカードにする', () => {
    const record = buildPostRecord(base);

    expect(record.embed).toEqual({
      $type: 'app.bsky.embed.external',
      external: {
        uri: 'https://shine-film.com/movies/abc',
        title: 'ハウスメイド (2010) | なんか見る',
        description: '『ハウスメイド』(2010年)。',
      },
    });
  });

  it('サムネイルblobがあれば埋め込みに含める', () => {
    const thumb = {
      $type: 'blob' as const,
      ref: {$link: 'abc'},
      mimeType: 'image/png',
      size: 1,
    };
    const record = buildPostRecord({...base, thumb});

    expect(record.embed.external.thumb).toEqual(thumb);
  });

  it('サムネイルが無ければthumbキー自体を含めない', () => {
    const record = buildPostRecord(base);

    expect('thumb' in record.embed.external).toBe(false);
  });

  it('本文にハッシュタグがあればfacetsを付ける', () => {
    const record = buildPostRecord({...base, text: 'こんにちは #青空映画部'});

    expect(record.facets).toEqual([
      {
        index: {byteStart: 16, byteEnd: 32},
        features: [{$type: 'app.bsky.richtext.facet#tag', tag: '青空映画部'}],
      },
    ]);
  });

  it('ハッシュタグが無ければfacetsキー自体を含めない', () => {
    const record = buildPostRecord(base);

    expect('facets' in record).toBe(false);
  });
});

describe('detectTagFacets', () => {
  it('UTF-8バイトオフセットでタグ位置を返す', () => {
    const facets = detectTagFacets('abc #tag def');

    expect(facets).toEqual([
      {
        index: {byteStart: 4, byteEnd: 8},
        features: [{$type: 'app.bsky.richtext.facet#tag', tag: 'tag'}],
      },
    ]);
  });

  it('複数のタグを検出する', () => {
    const facets = detectTagFacets('#foo #bar');

    expect(facets).toHaveLength(2);
    expect(facets[1]).toEqual({
      index: {byteStart: 5, byteEnd: 9},
      features: [{$type: 'app.bsky.richtext.facet#tag', tag: 'bar'}],
    });
  });

  it('タグが無ければ空配列を返す', () => {
    expect(detectTagFacets('タグなし本文')).toEqual([]);
  });
});
