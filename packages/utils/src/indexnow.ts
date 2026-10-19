/** IndexNow の鍵は公開前提。apps/front/public/<鍵>.txt と同じ値でなければ検証に落ちる */
export const INDEXNOW_KEY = 'b0391d9101c7ffce5d5f62eb7ea6e754';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_SITE_URL = 'https://shine-film.com';

export type IndexNowFetch = (
  url: string,
  init: RequestInit,
) => Promise<{ok: boolean; status: number; text(): Promise<string>}>;

export async function submitIndexNow(
  urls: string[],
  {
    key = INDEXNOW_KEY,
    fetchImpl = fetch,
  }: {key?: string; fetchImpl?: IndexNowFetch} = {},
): Promise<void> {
  if (urls.length === 0) {
    return;
  }

  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type': 'application/json; charset=utf-8'},
    body: JSON.stringify({
      host: new URL(INDEXNOW_SITE_URL).host,
      key,
      keyLocation: `${INDEXNOW_SITE_URL}/${key}.txt`,
      urlList: urls,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `IndexNow への送信に失敗しました: HTTP ${response.status} ${await response.text()}`,
    );
  }
}
