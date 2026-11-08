type WaitUntil = (promise: Promise<unknown>) => void;

export async function serveOgWithCache(
  request: Request,
  render: (request: Request) => Promise<Response>,
  cache: Cache,
  waitUntil: WaitUntil,
): Promise<Response> {
  if (request.method !== 'GET') {
    return render(request);
  }

  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await render(request);
  if (isCacheable(response)) {
    waitUntil(cache.put(request, response.clone()));
  }

  return response;
}

function isCacheable(response: Response): boolean {
  const cacheControl = response.headers.get('Cache-Control') ?? '';
  return response.status === 200 && /\bpublic\b/.test(cacheControl);
}
