export const WATCHED_STORAGE_KEY = 'shine-watched-v1';

/** ビット列はリスト内の並び順なので、古い回を足して順序が動いたら上げる */
const ENCODING_VERSION = '4';

export type WatchedFilm = {
  uid: string;
  title: string;
  year: number;
  movieYear?: number;
  posterUrl?: string;
};

type WinnerSource = {
  years: Array<{
    year: number;
    movies: Array<{
      uid: string;
      title?: string;
      movieYear?: number;
      posterUrl?: string;
      isWinner: boolean;
    }>;
  }>;
};

export function orderWinners(award: WinnerSource): WatchedFilm[] {
  return award.years
    .flatMap(group =>
      group.movies
        .filter(movie => movie.isWinner)
        .map(movie => ({
          uid: movie.uid,
          title: movie.title ?? 'Unknown Title',
          year: group.year,
          ...(movie.movieYear !== undefined && {movieYear: movie.movieYear}),
          ...(movie.posterUrl !== undefined && {posterUrl: movie.posterUrl}),
        })),
    )
    .toSorted((a, b) => a.year - b.year || a.uid.localeCompare(b.uid));
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCodePoint(...bytes);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | undefined {
  if (!/^[\w-]*$/.test(value)) {
    return undefined;
  }

  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  try {
    return Uint8Array.from(
      atob(base64),
      character => character.codePointAt(0) ?? 0,
    );
  } catch {
    return undefined;
  }
}

export function encodeWatched(
  order: readonly string[],
  watched: ReadonlySet<string>,
): string {
  const bytes = new Uint8Array(Math.ceil(order.length / 8));
  for (const [index, uid] of order.entries()) {
    if (watched.has(uid)) {
      bytes[index >> 3] |= 0x80 >> (index & 7);
    }
  }

  return `${ENCODING_VERSION}.${toBase64Url(bytes)}`;
}

export function decodeWatched(
  order: readonly string[],
  encoded: string | null | undefined,
): Set<string> {
  const watched = new Set<string>();
  const [version, payload] = (encoded ?? '').split('.', 2);
  if (version !== ENCODING_VERSION || payload === undefined) {
    return watched;
  }

  const bytes = fromBase64Url(payload);
  if (!bytes) {
    return watched;
  }

  for (const [index, uid] of order.entries()) {
    const byte = bytes[index >> 3] ?? 0;
    if (byte & (0x80 >> (index & 7))) {
      watched.add(uid);
    }
  }

  return watched;
}

export type WatchedStats = {total: number; count: number; percent: number};

export function watchedStats(
  order: readonly string[],
  watched: ReadonlySet<string>,
): WatchedStats {
  const total = order.length;
  const count = order.filter(uid => watched.has(uid)).length;
  const percent = total === 0 ? 0 : Math.round((count / total) * 100);

  return {total, count, percent};
}

export function isWatchedEncoding(value: string | null | undefined): boolean {
  return (
    typeof value === 'string' &&
    new RegExp(String.raw`^${ENCODING_VERSION}\.[\w-]+$`).test(value)
  );
}

export function buildWatchedShareLine({
  heading,
  total,
  count,
  percent,
}: WatchedStats & {heading: string}): string {
  return `${heading}の受賞作、${total}本中${count}本観てた（${percent}%）`;
}

export function buildWatchedShareText(
  input: WatchedStats & {heading: string; url: string},
): string {
  return `${buildWatchedShareLine(input)}\n${input.url}`;
}

export function mergeWatched(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): Set<string> {
  const merged = new Set(a);
  for (const uid of b) {
    merged.add(uid);
  }

  return merged;
}

export function toggleWatched(
  watched: ReadonlySet<string>,
  uid: string,
): Set<string> {
  const next = new Set(watched);
  if (next.has(uid)) {
    next.delete(uid);
  } else {
    next.add(uid);
  }

  return next;
}

export function readWatched(): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(WATCHED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as {uids?: unknown}) : undefined;
    return new Set(
      Array.isArray(parsed?.uids)
        ? parsed.uids.filter((uid): uid is string => typeof uid === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

export function writeWatched(watched: ReadonlySet<string>): void {
  try {
    globalThis.localStorage?.setItem(
      WATCHED_STORAGE_KEY,
      JSON.stringify({uids: [...watched]}),
    );
  } catch {
    // プライベートモードなどでは保存できないが、そのページのチェックは続けられる
  }
}
