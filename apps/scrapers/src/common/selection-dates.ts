function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function format(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/** 週はAPIのselections-serviceと同じく金曜始まり、月は1日をキーにする */
export function selectionDateKeys(date: string): {
  daily: string;
  weekly: string;
  monthly: string;
} {
  const [year, month, day] = date.split('-').map(Number);
  const daily = new Date(Date.UTC(year, month - 1, day));
  const daysSinceFriday = (daily.getUTCDay() - 5 + 7) % 7;
  const friday = new Date(Date.UTC(year, month - 1, day - daysSinceFriday));
  return {
    daily: format(daily),
    weekly: format(friday),
    monthly: `${year}-${pad(month)}-01`,
  };
}
