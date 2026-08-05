import {describe, expect, it} from 'vitest';
import {buildRssFeed} from './feed';

const items = [
  {
    uid: 'movie-1',
    title: 'ニーチェの馬',
    year: 2011,
    selectionDate: '2026-08-02',
  },
  {
    uid: 'movie-2',
    title: 'Tom & Jerry <Special>',
    year: undefined,
    selectionDate: '2026-08-01',
  },
];

describe('buildRssFeed', () => {
  it('RSS 2.0のフィードを生成する', () => {
    const xml = buildRssFeed(items);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<title>SHINE — 今日の1本</title>');
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
});
