import {selectionDateKeys} from './common/selection-dates';
import {SITE_URL} from './sns/site';

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
