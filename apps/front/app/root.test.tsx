import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createEnvironmentContext} from '@/lib/api';

let mockRootLoaderData:
  | {locale: string; canonicalUrl?: string; webAnalyticsToken?: string}
  | undefined = {
  locale: 'ja',
};

vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router')>()),
  Links: () => {},
  Meta: () => {},
  Outlet: () => {},
  Scripts: () => {},
  ScrollRestoration: () => {},
  isRouteErrorResponse: () => false,
  useRouteLoaderData: () => mockRootLoaderData,
}));

const {Layout, headers, loader} = await import('./root');

const callLoader = (
  request: Request,
  environment: Record<string, string> = {},
) =>
  loader({
    request,
    context: createEnvironmentContext(environment),
  } as unknown as Parameters<typeof loader>[0]);

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

describe('root loader のアクセス解析', () => {
  it('環境変数のWeb Analyticsトークンを返す', () => {
    const request = new Request('https://shine-film.com/');

    expect(
      callLoader(request, {PUBLIC_WEB_ANALYTICS_TOKEN: 'token-abc'})
        .webAnalyticsToken,
    ).toBe('token-abc');
  });

  it('トークンが未設定ならundefinedを返す', () => {
    const request = new Request('https://shine-film.com/');

    expect(callLoader(request).webAnalyticsToken).toBeUndefined();
  });

  it('トークンが空文字ならundefinedを返す', () => {
    const request = new Request('https://shine-film.com/');

    expect(
      callLoader(request, {PUBLIC_WEB_ANALYTICS_TOKEN: ''}).webAnalyticsToken,
    ).toBeUndefined();
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

  it('トークンがあればWeb Analyticsのbeaconを読み込む', () => {
    mockRootLoaderData = {locale: 'ja', webAnalyticsToken: 'token-abc'};

    const markup = renderToStaticMarkup(
      <Layout>
        <div />
      </Layout>,
    );

    expect(markup).toContain(
      'https://static.cloudflareinsights.com/beacon.min.js',
    );
  });

  it('beaconにトークンを渡す', () => {
    mockRootLoaderData = {locale: 'ja', webAnalyticsToken: 'token-abc'};

    const markup = renderToStaticMarkup(
      <Layout>
        <div />
      </Layout>,
    );

    expect(markup).toContain('token-abc');
  });

  it('トークンが無ければbeaconを読み込まない', () => {
    mockRootLoaderData = {locale: 'ja'};

    const markup = renderToStaticMarkup(
      <Layout>
        <div />
      </Layout>,
    );

    expect(markup).not.toContain('cloudflareinsights.com');
  });
});

const PUBLIC_FILES = new Set(
  Object.keys(import.meta.glob('../public/**/*')).map(file =>
    file.replace('../public', ''),
  ),
);

const ICON_LINK_PATTERN =
  /<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g;

function iconHrefs(): string[] {
  const markup = renderToStaticMarkup(
    <Layout>
      <div />
    </Layout>,
  );

  return [...markup.matchAll(ICON_LINK_PATTERN)].map(([, href]) => href);
}

describe('root Layout のアイコン', () => {
  beforeEach(() => {
    mockRootLoaderData = {locale: 'ja'};
  });

  it('アイコンのlinkを出力する', () => {
    expect(iconHrefs()).not.toEqual([]);
  });

  it('アイコンのlinkが全部public配下に実在する', () => {
    const missing = iconHrefs().filter(href => !PUBLIC_FILES.has(href));

    expect(missing).toEqual([]);
  });
});
