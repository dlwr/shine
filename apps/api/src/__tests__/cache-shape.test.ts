import {describe, expect, it} from 'vitest';
import {checkCacheShape, describeShape, normalizeCacheKey} from './cache-shape';

describe('describeShape', () => {
  it('入れ子の鍵を path で並べる', () => {
    expect(describeShape({movie: {uid: 'a', year: 1999}})).toEqual([
      'movie.uid',
      'movie.year',
    ]);
  });

  it('配列は [] を挟んで要素の形を出す', () => {
    expect(describeShape({items: [{uid: 'a'}, {uid: 'b'}]})).toEqual([
      'items[].uid',
    ]);
  });

  it('要素ごとに鍵が違う配列は和集合にする', () => {
    expect(describeShape([{uid: 'a'}, {title: 'b'}])).toEqual([
      '[].title',
      '[].uid',
    ]);
  });

  it('空の配列は形が分からないことを記録に残す', () => {
    expect(describeShape({items: []})).toEqual(['items[] 空']);
  });

  it('空のオブジェクトも印を残す', () => {
    expect(describeShape({filters: {}})).toEqual(['filters {}']);
  });

  it('値の型と件数では形が変わらない', () => {
    expect(
      // eslint-disable-next-line unicorn/no-null -- JSON の null を型として区別しないことの確認
      describeShape({items: [{uid: 'a', poster: null}]}),
    ).toEqual(
      describeShape({
        items: [
          {uid: 'b', poster: 'https://example.com/b.jpg'},
          {uid: 'c', poster: 'https://example.com/c.jpg'},
        ],
      }),
    );
  });

  it('値が undefined の鍵は JSON に残らないので形にも出さない', () => {
    expect(describeShape({uid: 'a', poster: undefined})).toEqual(['uid']);
  });
});

describe('normalizeCacheKey', () => {
  it('日付は実行日で変わるので伏せる', () => {
    expect(normalizeCacheKey('selections:daily:2026-09-18:ja:v2')).toBe(
      'selections:daily:{date}:ja:v2',
    );
  });

  it('日付以外はそのまま残す', () => {
    expect(normalizeCacheKey('awards:academy-best-picture:2000:v2')).toBe(
      'awards:academy-best-picture:2000:v2',
    );
  });
});

describe('checkCacheShape', () => {
  const recorded = {key: 'awards:list:v20', shape: ['awards[].slug']};

  it('記録と同じなら通す', () => {
    expect(checkCacheShape(recorded, recorded)).toEqual({ok: true});
  });

  it('記録が無ければ記録を促す', () => {
    expect(checkCacheShape(undefined, recorded)).toMatchObject({
      ok: false,
      reason: 'missing',
    });
  });

  it('形が変わったのに版が同じなら落とす', () => {
    const result = checkCacheShape(recorded, {
      key: 'awards:list:v20',
      shape: ['awards[].name'],
    });

    expect(result).toMatchObject({ok: false, reason: 'version-not-bumped'});
    expect(result.ok ? '' : result.message).toContain('awards:list:v20');
  });

  it('版が上がっていれば記録の更新だけを求める', () => {
    expect(
      checkCacheShape(recorded, {
        key: 'awards:list:v21',
        shape: ['awards[].name'],
      }),
    ).toMatchObject({ok: false, reason: 'stale-record'});
  });

  it('形が同じで版だけ上がったときも記録の更新を求める', () => {
    expect(
      checkCacheShape(recorded, {
        key: 'awards:list:v21',
        shape: recorded.shape,
      }),
    ).toMatchObject({ok: false, reason: 'stale-record'});
  });
});
