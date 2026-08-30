const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 週ごとに順番にリストを選ぶ。同じ週に何度起動しても同じリストになる */
export function pickWatchedList<T>(lists: T[], date: Date): T | undefined {
  if (lists.length === 0) {
    return undefined;
  }

  const week = Math.floor(date.getTime() / WEEK_MS);
  return lists[week % lists.length];
}
