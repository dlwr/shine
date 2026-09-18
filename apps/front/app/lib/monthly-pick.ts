import {apiFetch, type LoadContext} from './api';
import {resolveMovieTitle, type MovieTitleTranslation} from './movie-title';
import {selectBestPoster, type PosterInfo} from './poster';

export type MonthlyPickAward = {
  organization: string;
  category: string;
  year: number;
  isWinner: boolean;
  slug?: string;
};

export type MonthlyPick = {
  uid: string;
  title: string;
  year?: number;
  posterUrl?: string;
  awards: MonthlyPickAward[];
};

type SelectionNomination = {
  isWinner: boolean;
  category: {name: string; displayName?: string};
  ceremony: {year: number};
  organization: {
    name: string;
    shortName?: string;
    displayName?: string;
    slug?: string;
  };
};

type SelectionsResponse = {
  monthly?: {
    uid: string;
    year?: number;
    title?: string;
    translations?: MovieTitleTranslation[];
    posterUrls?: PosterInfo[];
    nominations?: SelectionNomination[];
  };
};

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

    const {monthly} = (await response.json()) as SelectionsResponse;
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
