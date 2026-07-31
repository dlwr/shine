export type MovieTitleTranslation = {
  languageCode: string;
  content: string;
  isDefault: number;
};

export type MovieTitleSource = {
  title?: string;
  translations?: MovieTitleTranslation[];
};

export type ResolveMovieTitleOptions = {
  locale?: string;
  fallback?: string;
  noTranslationsFallback?: string;
  preferredLanguages?: string[];
};

const hasContent = (translation: MovieTitleTranslation) =>
  translation.content.trim() !== '';

export function resolveMovieTitle(
  movie: MovieTitleSource,
  options: ResolveMovieTitleOptions = {},
): string {
  const {
    locale = 'en',
    fallback = 'Unknown Title',
    noTranslationsFallback = fallback,
    preferredLanguages = [],
  } = options;

  if (movie.title && movie.title.trim().length > 0) {
    return movie.title;
  }

  const translations = movie.translations ?? [];
  if (translations.length === 0) {
    return noTranslationsFallback;
  }

  const languageCode = locale.split('-')[0];

  const localeMatch = translations.find(
    translation =>
      translation.languageCode === languageCode && hasContent(translation),
  );
  if (localeMatch) {
    return localeMatch.content;
  }

  const defaultTranslation = translations.find(
    translation => translation.isDefault === 1 && hasContent(translation),
  );
  if (defaultTranslation) {
    return defaultTranslation.content;
  }

  for (const preferredLanguage of preferredLanguages) {
    const preferredMatch = translations.find(
      translation =>
        translation.languageCode === preferredLanguage &&
        hasContent(translation),
    );
    if (preferredMatch) {
      return preferredMatch.content;
    }
  }

  return translations[0].content || fallback;
}
