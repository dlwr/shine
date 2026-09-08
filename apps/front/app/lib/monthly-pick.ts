import {apiFetch, type LoadContext} from './api';
import {resolveMovieTitle, type MovieTitleTranslation} from './movie-title';
import {selectBestPoster, type PosterInfo} from './poster';

export type MonthlyPick = {
  uid: string;
  title: string;
  year?: number;
  posterUrl?: string;
};

type SelectionsResponse = {
  monthly?: {
    uid: string;
    year?: number;
    title?: string;
    translations?: MovieTitleTranslation[];
    posterUrls?: PosterInfo[];
  };
};

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
    };
  } catch {
    return undefined;
  }
}
