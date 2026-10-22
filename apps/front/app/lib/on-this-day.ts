const JST_OFFSET_MS = 9 * 3_600_000;
const LEAP_YEAR = 2000;

function toMonthDay(date: Date): string {
  return date.toISOString().slice(5, 10);
}

function parse(value: string): Date | undefined {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const date = new Date(
    Date.UTC(LEAP_YEAR, Number(match[1]) - 1, Number(match[2])),
  );
  return toMonthDay(date) === value ? date : undefined;
}

export function monthDayInJapan(now: Date): string {
  return toMonthDay(new Date(now.getTime() + JST_OFFSET_MS));
}

export function yearInJapan(now: Date): number {
  return new Date(now.getTime() + JST_OFFSET_MS).getUTCFullYear();
}

export function isMonthDay(value: string): boolean {
  return parse(value) !== undefined;
}

export function shiftMonthDay(value: string, days: number): string {
  const date = parse(value)!;
  date.setUTCDate(date.getUTCDate() + days);
  return toMonthDay(
    new Date(Date.UTC(LEAP_YEAR, date.getUTCMonth(), date.getUTCDate())),
  );
}

export function formatMonthDay(value: string): string {
  const [month, day] = value.split('-').map(Number);
  return `${month}月${day}日`;
}
