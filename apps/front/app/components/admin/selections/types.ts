import type {
  AdminMovieListItemData,
  PreviewSelectionsData,
  SelectionPreviewData,
} from '@/lib/api-types';

export type SelectionData = SelectionPreviewData;
export type PreviewSelections = PreviewSelectionsData;
export type SearchMovie = AdminMovieListItemData;

export type SelectionType = 'daily' | 'weekly' | 'monthly';

export const SELECTION_TYPES: readonly SelectionType[] = [
  'daily',
  'weekly',
  'monthly',
];

export const selectionKeyMap: Record<SelectionType, keyof PreviewSelections> = {
  daily: 'nextDaily',
  weekly: 'nextWeekly',
  monthly: 'nextMonthly',
};

export const SELECTION_TYPE_LABELS: Record<SelectionType, string> = {
  daily: '今日の映画',
  weekly: '今週の映画',
  monthly: '今月の映画',
};

export const SELECTION_TYPE_COLORS: Record<SelectionType, string> = {
  daily: 'from-blue-500 to-blue-600',
  weekly: 'from-green-500 to-green-600',
  monthly: 'from-purple-500 to-purple-600',
};
