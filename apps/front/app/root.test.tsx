import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';

let mockRootLoaderData: {locale: string} | undefined = {locale: 'ja'};

vi.mock('react-router', () => ({
  Links: () => {},
  Meta: () => {},
  Outlet: () => {},
  Scripts: () => {},
  ScrollRestoration: () => {},
  isRouteErrorResponse: () => false,
  useRouteLoaderData: () => mockRootLoaderData,
}));

const {Layout, loader} = await import('./root');

describe('root loader', () => {
  it('Accept-Languageにenが指定されたらenを返す', () => {
    const request = new Request('https://shine-film.com/', {
      headers: {'accept-language': 'en-US,en;q=0.9'},
    });

    expect(loader({request} as Parameters<typeof loader>[0])).toEqual({
      locale: 'en',
    });
  });

  it('Accept-Languageがなければjaを返す', () => {
    const request = new Request('https://shine-film.com/');

    expect(loader({request} as Parameters<typeof loader>[0])).toEqual({
      locale: 'ja',
    });
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
});
