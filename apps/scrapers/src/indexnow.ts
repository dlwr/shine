import {selectionDateKeys} from './common/selection-dates';
import {SITE_URL} from './sns/site';

/** IndexNow の鍵は公開前提。apps/front/public/<鍵>.txt と同じ値でなければ検証に落ちる */
export const INDEXNOW_KEY = 'b0391d9101c7ffce5d5f62eb7ea6e754';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

export type IndexNowSelections = {
  daily?: {uid: string};
  weekly?: {uid: string};
  monthly?: {uid: string};
};

function previousDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
}

/**
 * その日に中身が変わった URL だけを返す。
 * ホームと日替わり一覧は毎日変わり、映画ページは選ばれた日に帯が付く。
 */
export function buildIndexNowUrls(
  selections: IndexNowSelections,
  date: string,
): string[] {
  const today = selectionDateKeys(date);
  const yesterday = selectionDateKeys(previousDay(date));
  const urls = [`${SITE_URL}/`, `${SITE_URL}/daily`];

  const rotated: Array<keyof IndexNowSelections> = [
    'daily',
    'weekly',
    'monthly',
  ];
  for (const type of rotated) {
    const uid = selections[type]?.uid;
    if (!uid || today[type] === yesterday[type]) {
      continue;
    }

    const url = `${SITE_URL}/movies/${uid}`;
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }

  return urls;
}

export async function submitIndexNow(
  urls: string[],
  {
    fetchImpl = fetch,
  }: {fetchImpl?: (url: string, init: RequestInit) => Promise<Response>} = {},
): Promise<void> {
  if (urls.length === 0) {
    return;
  }

  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type': 'application/json; charset=utf-8'},
    body: JSON.stringify({
      host: new URL(SITE_URL).host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `IndexNow への送信に失敗しました: HTTP ${response.status} ${await response.text()}`,
    );
  }
}
