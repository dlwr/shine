const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 週ごとに順番に1つ選ぶ。同じ週に何度起動しても同じものになる */
export function pickWeeklyItem<T>(items: T[], date: Date): T | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const week = Math.floor(date.getTime() / WEEK_MS);
  return items[week % items.length];
}
