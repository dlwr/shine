export type OrderStreak = {
  current: number;
  best: number;
  answeredDates: string[];
};

export const EMPTY_ORDER_STREAK: OrderStreak = {
  current: 0,
  best: 0,
  answeredDates: [],
};

export function recordOrderAnswer(
  streak: OrderStreak,
  date: string,
  isCorrect: boolean,
): OrderStreak {
  if (streak.answeredDates.includes(date)) {
    return streak;
  }

  const current = isCorrect ? streak.current + 1 : 0;
  return {
    current,
    best: Math.max(streak.best, current),
    answeredDates: [...streak.answeredDates, date],
  };
}

export function previousDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}
