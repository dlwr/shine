import {apiFetch, type LoadContext} from './api';
import type {SelectionsData} from './api-types';
import {resolveMovieTitle} from './movie-title';
import {selectBestPoster} from './poster';

export type MonthlyPickAward = {
  organization: string;
  category: string;
  year: number;
  isWinner: boolean;
  slug?: string;
};

const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MAX_PICK_CACHE_SECONDS = 3600;

/** 今月の1本を指す応答を、次の月の1本に切り替わる瞬間より先まで持たせない */
export function monthlyPickCacheSeconds(now: Date): number {
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const untilNextMonth = Math.floor((nextMonth - now.getTime()) / 1000);

  return Math.max(0, Math.min(MAX_PICK_CACHE_SECONDS, untilNextMonth));
}

export function monthlyPickLabel(now: Date, locale: string): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  return locale === 'en'
    ? `${ENGLISH_MONTHS[month]} ${year} pick`
    : `${year}年${month + 1}月の1本`;
}

export type MonthlyPick = {
  uid: string;
  title: string;
  year?: number;
  posterUrl?: string;
  awards: MonthlyPickAward[];
};

type SelectionNomination = SelectionsData['monthly']['nominations'][number];

function toAward(nomination: SelectionNomination): MonthlyPickAward {
  const {organization, category, ceremony} = nomination;
  return {
    organization:
      organization.displayName || organization.shortName || organization.name,
    category: category.displayName || category.name,
    year: ceremony.year,
    isWinner: nomination.isWinner,
    ...(organization.slug && {slug: organization.slug}),
  };
}

export async function fetchMonthlyPick(
  context: LoadContext,
  locale: string,
  signal?: AbortSignal,
): Promise<MonthlyPick | undefined> {
  try {
    const response = await apiFetch(context, `/?locale=${locale}`, {signal});
    if (!response.ok) {
      return undefined;
    }

    const {monthly} = (await response.json()) as SelectionsData;
    if (!monthly) {
      return undefined;
    }

    const posterUrl = selectBestPoster(monthly.posterUrls, locale);
    return {
      uid: monthly.uid,
      title: resolveMovieTitle(monthly, {locale}),
      year: monthly.year,
      ...(posterUrl && {posterUrl}),
      awards: (monthly.nominations ?? []).map(nomination =>
        toAward(nomination),
      ),
    };
  } catch {
    return undefined;
  }
}
