const TMDB_POSTER =
  /^https:\/\/image\.tmdb\.org\/t\/p\/(original|w\d+)\/([\w-]+\.(?:jpg|jpeg|png|webp))$/;
const POSTER_PATH =
  /^\/posters\/(original|w\d+)\/([\w-]+\.(?:jpg|jpeg|png|webp))$/;
const TRANSFORMATION_PREFIX = '/cdn-cgi/image/format=auto,quality=70';

/**
 * Image Transformations はリモートの変換元を許可していないので、
 * TMDb のポスターを自分の zone の /posters 経路に置き換えてから通す
 */
export function deliveredPosterUrl(
  url: string | undefined,
  isEnabled: boolean,
): string | undefined {
  if (!url || !isEnabled) {
    return url;
  }

  const match = TMDB_POSTER.exec(url);
  if (!match) {
    return url;
  }

  const [, size, file] = match;
  return `${TRANSFORMATION_PREFIX}/posters/${size}/${file}`;
}

export function parsePosterPath(
  pathname: string,
): {size: string; file: string} | undefined {
  const match = POSTER_PATH.exec(pathname);
  if (!match) {
    return undefined;
  }

  return {size: match[1], file: match[2]};
}

export function tmdbPosterUrl({
  size,
  file,
}: {
  size: string;
  file: string;
}): string {
  return `https://image.tmdb.org/t/p/${size}/${file}`;
}
