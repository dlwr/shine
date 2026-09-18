import {describe, expect, it} from 'vitest';
import {buildRssFeed, mergeFeedItems, type FeedItem} from './feed';

const items: FeedItem[] = [
  {
    period: 'daily',
    uid: 'movie-1',
    title: 'ニーチェの馬',
    year: 2011,
    selectionDate: '2026-08-02',
  },
  {
    period: 'daily',
    uid: 'movie-2',
    title: 'Tom & Jerry <Special>',
    year: undefined,
    selectionDate: '2026-08-01',
  },
  {
    period: 'monthly',
    uid: 'movie-3',
    title: 'リアリティー',
    year: 2012,
    selectionDate: '2026-08-01',
  },
];

describe('buildRssFeed', () => {
  it('RSS 2.0のフィードを生成する', () => {
    const xml = buildRssFeed(items);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<title>SHINE — 今月の1本と今日の1本</title>');
    expect(xml).toContain('<link>https://shine-film.com</link>');
  });

  it('itemに映画タイトルと年、詳細ページへのリンクを含む', () => {
    const xml = buildRssFeed(items);

    expect(xml).toContain('<title>『ニーチェの馬』(2011)</title>');
    expect(xml).toContain('<link>https://shine-film.com/movies/movie-1</link>');
  });

  it('年が無ければ括弧を出さない', () => {
    const xml = buildRssFeed(items);

    expect(xml).toContain('『Tom &amp; Jerry &lt;Special&gt;』</title>');
  });

  it('guidは日付と映画uidの組で一意にする', () => {
    const xml = buildRssFeed(items);

    expect(xml).toContain(
      '<guid isPermaLink="false">daily-2026-08-02-movie-1</guid>',
    );
  });

  it('pubDateはJSTの0時をRFC1123形式で出す', () => {
    const xml = buildRssFeed(items);

    expect(xml).toContain('<pubDate>Sat, 01 Aug 2026 15:00:00 GMT</pubDate>');
  });

  it('XMLの特殊文字をエスケープする', () => {
    const xml = buildRssFeed(items);

    expect(xml).not.toContain('Tom & Jerry <Special>');
  });

  it('今月の1本は題名の前に「今月の1本」を付け、guidを月替わりで分ける', () => {
    const xml = buildRssFeed(items);

    expect(xml).toContain('<title>今月の1本『リアリティー』(2012)</title>');
    expect(xml).toContain(
      '<guid isPermaLink="false">monthly-2026-08-01-movie-3</guid>',
    );
  });

  it('今月の1本の説明にはタグラインと投稿の呼びかけを入れる', () => {
    const xml = buildRssFeed(items);

    expect(xml).toContain(
      '『リアリティー』(2012)。毎月1本、みんなで同じ映画を観る。観たら映画ページから記事や SNS のポストを貼ってください。',
    );
    expect(xml).toContain(
      '<link>https://shine-film.com/movies/movie-3#article-links</link>',
    );
  });
});

const daily = (uid: string, selectionDate: string): FeedItem => ({
  period: 'daily',
  uid,
  title: uid,
  selectionDate,
});
const monthly = (uid: string, selectionDate: string): FeedItem => ({
  period: 'monthly',
  uid,
  title: uid,
  selectionDate,
});

describe('mergeFeedItems', () => {
  it('日付の新しい順に並べる', () => {
    const merged = mergeFeedItems(
      [daily('d3', '2026-09-03'), daily('d1', '2026-09-01')],
      [monthly('m9', '2026-09-01'), monthly('m8', '2026-08-01')],
    );

    expect(merged.map(item => item.uid)).toEqual(['d3', 'm9', 'd1', 'm8']);
  });

  it('同じ日付なら今月の1本を先に置く', () => {
    const merged = mergeFeedItems(
      [daily('d1', '2026-09-01')],
      [monthly('m9', '2026-09-01')],
    );

    expect(merged.map(item => item.uid)).toEqual(['m9', 'd1']);
  });
});
