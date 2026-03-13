export type PosterInfo = {
  url: string;
  languageCode?: string;
  isPrimary: number;
};

export function selectBestPoster(
  posters: PosterInfo[] | undefined,
  locale: string,
): string | undefined {
  if (!posters || posters.length === 0) {
    return undefined;
  }

  // Convert locale to language code (e.g., 'ja' from 'ja-JP')
  const languageCode = locale.split('-')[0];

  // Priority:
  // 1. Primary poster with matching language
  // 2. Non-primary poster with matching language
  // 3. Primary poster with no language (international)
  // 4. Any primary poster
  // 5. First poster

  const primaryLocaleMatch = posters.find(
    p => p.isPrimary === 1 && p.languageCode === languageCode,
  );
  if (primaryLocaleMatch) {
    return primaryLocaleMatch.url;
  }

  const localeMatch = posters.find(p => p.languageCode === languageCode);
  if (localeMatch) {
    return localeMatch.url;
  }

  const primaryInternational = posters.find(
    p => p.isPrimary === 1 && !p.languageCode,
  );
  if (primaryInternational) {
    return primaryInternational.url;
  }

  const primaryAny = posters.find(p => p.isPrimary === 1);
  if (primaryAny) {
    return primaryAny.url;
  }

  return posters[0].url;
}
