import {parsePosterPath, tmdbPosterUrl} from '@/lib/poster-delivery';

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Image Transformations の変換元になる、同じ zone 上の TMDb ポスターの写し */
export async function servePoster(pathname: string): Promise<Response> {
  const poster = parsePosterPath(pathname);
  if (!poster) {
    return new Response('Not Found', {status: 404});
  }

  const upstream = await fetch(tmdbPosterUrl(poster), {
    cf: {cacheEverything: true, cacheTtl: ONE_YEAR},
  });
  if (!upstream.ok) {
    return new Response('Not Found', {status: upstream.status});
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'cache-control': `public, max-age=${ONE_YEAR}, immutable`,
    },
  });
}
