import {hasJapaneseText} from '@shine/availability';

export type TmdbLocalizedTitle = {
  title?: string | undefined;
  original_title?: string | undefined;
  original_language?: string | undefined;
};

/** TMDb は language=ja で日本語訳が無いと原題をそのまま返すので、原題と同じものは邦題として扱わない */
export function pickJapaneseTitle(
  details: TmdbLocalizedTitle | undefined,
): string | undefined {
  if (details === undefined) {
    return undefined;
  }

  const title = details.title?.trim();
  if (!title) {
    return undefined;
  }

  if (details.original_language === 'ja') {
    return hasJapaneseText(title) ? title : undefined;
  }

  return title === details.original_title?.trim() ? undefined : title;
}
