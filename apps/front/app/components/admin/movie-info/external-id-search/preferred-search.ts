export type SearchLanguage = 'ja-JP' | 'en-US';

export type PreferredSearch = {text: string; language: SearchLanguage};

export function preferredSearchFor(
  translations: Array<{languageCode: string; content: string}> | undefined,
): PreferredSearch {
  const withContent = (translations ?? []).filter(
    translation => translation.content && translation.content.trim() !== '',
  );
  const byLanguage = (code: string) =>
    withContent.find(translation => translation.languageCode === code);

  const japanese = byLanguage('ja');
  if (japanese) {
    return {text: japanese.content.trim(), language: 'ja-JP'};
  }

  const english = byLanguage('en');
  if (english) {
    return {text: english.content.trim(), language: 'en-US'};
  }

  const [fallback] = withContent;
  if (fallback) {
    return {text: fallback.content.trim(), language: 'en-US'};
  }

  return {text: '', language: 'ja-JP'};
}
