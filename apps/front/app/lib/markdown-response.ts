import {getLocaleFromRequest} from './locale';

type ConvertHtml = (html: string, url: string) => Promise<string | undefined>;

type MarkdownConverter = {
  toMarkdown(
    file: MarkdownDocument,
    options: ConversionRequestOptions,
  ): Promise<ConversionResponse>;
};

const MARKDOWN_CACHE_CONTROL = 'public, max-age=3600';

function isEligiblePath(request: Request): boolean {
  const {pathname} = new URL(request.url);
  return pathname !== '/admin' && !pathname.startsWith('/admin/');
}

function isHtml(response: Response): boolean {
  return (
    response.status === 200 &&
    (response.headers.get('Content-Type') ?? '').startsWith('text/html')
  );
}

function withVaryAccept(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.append('Vary', 'Accept');
  return result;
}

export function prefersMarkdown(request: Request): boolean {
  return (
    request.method === 'GET' &&
    (request.headers.get('Accept') ?? '').includes('text/markdown') &&
    isEligiblePath(request)
  );
}

export function withMarkdownAlternate(
  request: Request,
  response: Response,
): Response {
  if (!isEligiblePath(request) || !isHtml(response)) {
    return response;
  }

  const result = withVaryAccept(response);
  const {origin} = new URL(request.url);
  result.headers.append(
    'Link',
    `<${request.url}>; rel="alternate"; type="text/markdown"`,
  );
  result.headers.append('Link', `<${origin}/developers>; rel="service-doc"`);
  result.headers.append(
    'Link',
    `<${origin}/.well-known/api-catalog>; rel="api-catalog"`,
  );
  return result;
}

export function htmlToMarkdownWith(ai: MarkdownConverter): ConvertHtml {
  return async (html, url) => {
    try {
      const result = await ai.toMarkdown(
        {name: 'page.html', blob: new Blob([html], {type: 'text/html'})},
        {conversionOptions: {html: {hostname: url}}},
      );
      return result.format === 'error' ? undefined : result.data;
    } catch {
      return;
    }
  };
}

export async function serveMarkdown(
  request: Request,
  {
    render,
    convert,
    cache,
    waitUntil,
  }: {
    render: (request: Request) => Promise<Response>;
    convert: ConvertHtml;
    cache: Cache;
    waitUntil: (promise: Promise<unknown>) => void;
  },
): Promise<Response> {
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.set(
    '__markdown_locale',
    getLocaleFromRequest(request),
  );
  const cacheKey = new Request(cacheKeyUrl);

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const htmlRequest = new Request(request);
  htmlRequest.headers.set('Accept', 'text/html');
  const response = await render(htmlRequest);
  if (!isHtml(response)) {
    return response;
  }

  const html = await response.text();
  const markdown = await convert(html, request.url);
  if (markdown === undefined) {
    return withVaryAccept(new Response(html, response));
  }

  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/markdown; charset=utf-8');
  headers.set('Cache-Control', MARKDOWN_CACHE_CONTROL);
  headers.append('Vary', 'Accept');
  const result = new Response(markdown, {status: 200, headers});

  if (!response.headers.has('Set-Cookie')) {
    waitUntil(cache.put(cacheKey, result.clone()));
  }

  return result;
}
