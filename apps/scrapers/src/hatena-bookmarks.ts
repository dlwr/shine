const COUNT_ENDPOINT = 'https://bookmark.hatenaapis.com/count/entries';
const TIMEOUT_MS = 10_000;

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export async function fetchHatenaBookmarkCounts(
  urls: string[],
  fetcher: Fetcher = fetch,
): Promise<Map<string, number>> {
  if (urls.length === 0) {
    return new Map();
  }

  const query = urls.map(url => `url=${encodeURIComponent(url)}`).join('&');
  const response = await fetcher(`${COUNT_ENDPOINT}?${query}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`はてなブックマークの件数 API が ${response.status}`);
  }

  const body = (await response.json()) as Record<string, number>;
  return new Map(urls.map(url => [url, body[url] ?? 0]));
}

export async function fetchHatenaBookmarkCountsOrUndefined(
  urls: string[],
): Promise<Map<string, number> | undefined> {
  try {
    return await fetchHatenaBookmarkCounts(urls);
  } catch (error) {
    console.warn('はてなブックマーク数を取れませんでした:', error);
    return undefined;
  }
}
