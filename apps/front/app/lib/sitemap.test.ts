import {describe, expect, it} from 'vitest';
import {buildSitemapIndex, buildUrlSet} from './sitemap';

describe('buildSitemapIndex', () => {
  it('XML宣言から始まる', () => {
    expect(buildSitemapIndex(['/sitemap/movies-1.xml'])).toMatch(
      /^<\?xml version="1\.0" encoding="UTF-8"\?>/,
    );
  });

  it('sitemapindex要素で包む', () => {
    const xml = buildSitemapIndex(['/sitemap/movies-1.xml']);

    expect(xml).toContain(
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain('</sitemapindex>');
  });

  it('渡したパスを絶対URLのlocとして列挙する', () => {
    const xml = buildSitemapIndex([
      '/sitemap/movies-1.xml',
      '/sitemap/movies-2.xml',
    ]);

    expect(xml).toContain(
      '<loc>https://shine-film.com/sitemap/movies-1.xml</loc>',
    );
    expect(xml).toContain(
      '<loc>https://shine-film.com/sitemap/movies-2.xml</loc>',
    );
  });
});

describe('buildUrlSet', () => {
  it('XML宣言から始まる', () => {
    expect(buildUrlSet([{path: '/'}])).toMatch(
      /^<\?xml version="1\.0" encoding="UTF-8"\?>/,
    );
  });

  it('urlset要素で包む', () => {
    const xml = buildUrlSet([{path: '/'}]);

    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain('</urlset>');
  });

  it('各エントリを絶対URLのlocとして列挙する', () => {
    const xml = buildUrlSet([{path: '/'}, {path: '/movies/abc'}]);

    expect(xml).toContain('<loc>https://shine-film.com/</loc>');
    expect(xml).toContain('<loc>https://shine-film.com/movies/abc</loc>');
  });

  it('changefreqを指定できる', () => {
    expect(buildUrlSet([{path: '/', changefreq: 'daily'}])).toContain(
      '<changefreq>daily</changefreq>',
    );
  });

  it('changefreqを指定しなければ出力しない', () => {
    expect(buildUrlSet([{path: '/'}])).not.toContain('<changefreq>');
  });

  it('URLに含まれるアンパサンドをエスケープする', () => {
    expect(buildUrlSet([{path: '/search?q=a&b'}])).toContain(
      '<loc>https://shine-film.com/search?q=a&amp;b</loc>',
    );
  });

  it('エントリが空でも妥当なurlsetを返す', () => {
    const xml = buildUrlSet([]);

    expect(xml).toContain('<urlset');
    expect(xml).toContain('</urlset>');
  });
});
