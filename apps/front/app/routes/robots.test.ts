import {describe, expect, it} from 'vitest';
import {loader} from './robots';

const robotsBody = async () => {
  const response = loader();
  return response.text();
};

describe('robots.txt', () => {
  it('sitemapの場所を宣言する', async () => {
    expect(await robotsBody()).toContain(
      'Sitemap: https://shine-film.com/sitemap.xml',
    );
  });

  it('すべてのクローラーにトップ配下を許可する', async () => {
    const body = await robotsBody();

    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
  });

  it('管理画面をクロール対象から除外する', async () => {
    expect(await robotsBody()).toContain('Disallow: /admin');
  });

  it('検索結果ページをクロール対象から除外する', async () => {
    expect(await robotsBody()).toContain('Disallow: /search');
  });

  it('React Routerのマニフェストをクロール対象から除外する', async () => {
    expect(await robotsBody()).toContain('Disallow: /__manifest');
  });

  it('プレーンテキストとして返す', () => {
    expect(loader().headers.get('content-type')).toContain('text/plain');
  });
});
