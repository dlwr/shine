import {simpleHash} from '../utils/hash';

export type SelectionType = 'daily' | 'weekly' | 'monthly';

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

export function getSelectionDate(date: Date, type: SelectionType): string {
  switch (type) {
    case 'daily': {
      return formatDate(date);
    }

    case 'weekly': {
      const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
      const fridayDate = new Date(date);
      fridayDate.setDate(date.getDate() - daysSinceFriday);
      return formatDate(fridayDate);
    }

    case 'monthly': {
      return `${date.getFullYear()}-${(date.getMonth() + 1)
        .toString()
        .padStart(2, '0')}-01`;
    }
  }
}

export function getDateSeed(date: Date, type: SelectionType): number {
  return simpleHash(`${type}-${getSelectionDate(date, type)}`);
}

export const SELECTION_TYPES: readonly SelectionType[] = [
  'daily',
  'weekly',
  'monthly',
];

export function isSelectionType(value: unknown): value is SelectionType {
  return SELECTION_TYPES.includes(value as SelectionType);
}

export function nextSelectionDates(now: Date): Record<SelectionType, Date> {
  const daily = new Date(now);
  daily.setDate(now.getDate() + 1);

  const daysSinceFriday = (now.getDay() - 5 + 7) % 7;
  const weekly = new Date(now);
  weekly.setDate(now.getDate() - daysSinceFriday + 7);

  const monthly = new Date(now);
  monthly.setDate(1);
  monthly.setMonth(now.getMonth() + 1);

  return {daily, weekly, monthly};
}
