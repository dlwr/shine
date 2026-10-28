import {tryApiJson, type LoadContext} from '@/lib/api';
import type {Locale} from '@/lib/locale';
import type {SelectionPreviewData} from '@/lib/api-types';

export type SelectionHistoryItem = {
  uid: string;
  title: string;
  year?: number;
  selectionDate: string;
  posterUrl?: string;
  articleLinkCount?: number;
};

export async function loadNextSelection(
  locale: Locale,
  context: LoadContext,
  request: Request,
): Promise<SelectionHistoryItem | undefined> {
  const preview = await tryApiJson<SelectionPreviewData>(
    context,
    `/selections/monthly/next?locale=${locale}`,
    {signal: request.signal},
  );
  if (!preview) {
    return undefined;
  }

  const {date, movie} = preview;
  return {
    uid: movie.uid,
    title: movie.title,
    year: movie.year,
    selectionDate: date,
    posterUrl: movie.posterUrl,
  };
}
