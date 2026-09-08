import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createEnvironmentContext} from '@/lib/api';

let mockRootLoaderData:
  | {
      locale: string;
      canonicalUrl?: string;
      webAnalyticsToken?: string;
      monthly?: {uid: string; title: string; year?: number};
    }
  | undefined = {
  locale: 'ja',
};
let mockPathname = '/';

vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router')>()),
  Links: () => {},
  Meta: () => {},
  Outlet: () => {},
  Scripts: () => {},
  ScrollRestoration: () => {},
  isRouteErrorResponse: () => false,
  useRouteLoaderData: () => mockRootLoaderData,
  useLocation: () => ({pathname: mockPathname}),
}));

const {default: App, Layout, headers, loader} = await import('./root');

const MONTHLY_RESPONSE = JSON.stringify({
  monthly: {uid: 'm1', title: '邦題', year: 2023, posterUrls: []},
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(MONTHLY_RESPONSE)),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const callLoader = (
  request: Request,
  environment: Record<string, string> = {},
) =>
  loader({
    request,
    context: createEnvironmentContext(environment),
  } as unknown as Parameters<typeof loader>[0]);

describe('root loader', () => {
  it('Accept-Languageにenが指定されたらenを返す', async () => {
    const request = new Request('https://shine-film.com/', {
      headers: {'accept-language': 'en-US,en;q=0.9'},
    });

    const data = await callLoader(request);
    expect(data.locale).toBe('en');
  });

  it('Accept-Languageがなければjaを返す', async () => {
    const request = new Request('https://shine-film.com/');

    const data = await callLoader(request);
    expect(data.locale).toBe('ja');
  });

  it('canonical URLを正規ドメインで返す', async () => {
    const request = new Request(
      'https://shine-front.yuta25.workers.dev/movies/abc',
    );

    const data = await callLoader(request);
    expect(data.canonicalUrl).toBe('https://shine-film.com/movies/abc');
  });

  it('canonical URLからクエリパラメータを取り除く', async () => {
    const request = new Request('https://shine-film.com/movies/abc?locale=en');

    const data = await callLoader(request);
    expect(data.canonicalUrl).toBe('https://shine-film.com/movies/abc');
  });
});

describe('root loader のアクセス解析', () => {
  it('環境変数のWeb Analyticsトークンを返す', async () => {
    const request = new Request('https://shine-film.com/');

    const data = await callLoader(request, {
      PUBLIC_WEB_ANALYTICS_TOKEN: 'token-abc',
    });

    expect(data.webAnalyticsToken).toBe('token-abc');
  });

  it('トークンが未設定ならundefinedを返す', async () => {
    const request = new Request('https://shine-film.com/');

    const data = await callLoader(request);
    expect(data.webAnalyticsToken).toBeUndefined();
  });

  it('トークンが空文字ならundefinedを返す', async () => {
    const request = new Request('https://shine-film.com/');

    const data = await callLoader(request, {PUBLIC_WEB_ANALYTICS_TOKEN: ''});

    expect(data.webAnalyticsToken).toBeUndefined();
  });
});

describe('root loader の今月の1本', () => {
  it('公開ページでは選出 API から今月の1本を取る', async () => {
    const request = new Request('https://shine-film.com/awards', {
      headers: {'accept-language': 'ja'},
    });

    const {monthly} = await callLoader(request, {
      PUBLIC_API_URL: 'https://api.example',
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example/?locale=ja',
      expect.anything(),
    );
    expect(monthly).toEqual({uid: 'm1', title: '邦題', year: 2023});
  });

  it('ホームでは取らない', async () => {
    const request = new Request('https://shine-film.com/');

    const data = await callLoader(request);
    expect(data.monthly).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('管理画面では取らない', async () => {
    const request = new Request('https://shine-film.com/admin/movies');

    const data = await callLoader(request);
    expect(data.monthly).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('API が落ちていても他の値は返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const request = new Request('https://shine-film.com/awards');

    const data = await callLoader(request);

    expect(data.locale).toBe('ja');
    expect(data.monthly).toBeUndefined();
  });
});

describe('root App', () => {
  it('今月の1本があれば帯を出す', () => {
    mockRootLoaderData = {
      locale: 'ja',
      monthly: {uid: 'm1', title: '邦題', year: 2023},
    };
    mockPathname = '/awards';

    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('href="/movies/m1"');
    expect(markup).toContain('邦題');
  });

  it('今月の1本が無ければ帯を出さない', () => {
    mockRootLoaderData = {locale: 'ja'};

    const markup = renderToStaticMarkup(<App />);

    expect(markup).not.toContain('<aside');
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

  return markup
    .matchAll(ICON_LINK_PATTERN)
    .map(([, href]) => href)
    .toArray();
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
