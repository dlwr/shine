import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';

let mockRootLoaderData: {locale: string; canonicalUrl?: string} | undefined = {
  locale: 'ja',
};

vi.mock('react-router', () => ({
  Links: () => {},
  Meta: () => {},
  Outlet: () => {},
  Scripts: () => {},
  ScrollRestoration: () => {},
  isRouteErrorResponse: () => false,
  useRouteLoaderData: () => mockRootLoaderData,
}));

const {Layout, headers, loader} = await import('./root');

const callLoader = (request: Request) =>
  loader({request} as Parameters<typeof loader>[0]);

describe('root loader', () => {
  it('Accept-Languageにenが指定されたらenを返す', () => {
    const request = new Request('https://shine-film.com/', {
      headers: {'accept-language': 'en-US,en;q=0.9'},
    });

    expect(callLoader(request).locale).toBe('en');
  });

  it('Accept-Languageがなければjaを返す', () => {
    const request = new Request('https://shine-film.com/');

    expect(callLoader(request).locale).toBe('ja');
  });

  it('canonical URLを正規ドメインで返す', () => {
    const request = new Request(
      'https://shine-front.yuta25.workers.dev/movies/abc',
    );

    expect(callLoader(request).canonicalUrl).toBe(
      'https://shine-film.com/movies/abc',
    );
  });

  it('canonical URLからクエリパラメータを取り除く', () => {
    const request = new Request('https://shine-film.com/movies/abc?locale=en');

    expect(callLoader(request).canonicalUrl).toBe(
      'https://shine-film.com/movies/abc',
    );
  });
});

describe('root headers', () => {
  it('Accept-Languageで内容が変わることを宣言する', () => {
    expect(headers()).toEqual({Vary: 'Accept-Language'});
  });
});

describe('root Layout', () => {
  beforeEach(() => {
    mockRootLoaderData = {locale: 'ja'};
  });

  it('localeがjaならhtmlのlang属性がjaになる', () => {
    const markup = renderToStaticMarkup(
      <Layout>
        <div />
      </Layout>,
    );

    expect(markup).toContain('<html lang="ja"');
  });

  it('localeがenならhtmlのlang属性がenになる', () => {
    mockRootLoaderData = {locale: 'en'};

    const markup = renderToStaticMarkup(
      <Layout>
        <div />
      </Layout>,
    );

    expect(markup).toContain('<html lang="en"');
  });

  it('loaderデータが無い場合もlang属性はjaになる', () => {
    mockRootLoaderData = undefined;

    const markup = renderToStaticMarkup(
      <Layout>
        <div />
      </Layout>,
    );

    expect(markup).toContain('<html lang="ja"');
  });

  it('canonicalリンクを出力する', () => {
    mockRootLoaderData = {
      locale: 'ja',
      canonicalUrl: 'https://shine-film.com/movies/abc',
    };

    const markup = renderToStaticMarkup(
      <Layout>
        <div />
      </Layout>,
    );

    expect(markup).toContain(
      '<link rel="canonical" href="https://shine-film.com/movies/abc"/>',
    );
  });

  it('canonical URLが無ければcanonicalリンクを出力しない', () => {
    mockRootLoaderData = {locale: 'ja'};

    const markup = renderToStaticMarkup(
      <Layout>
        <div />
      </Layout>,
    );

    expect(markup).not.toContain('rel="canonical"');
  });
});
