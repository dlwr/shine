export const SUPPORTED_LOCALES = ['ja', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ja';

function isSupportedLocale(value: string | undefined | null): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function getLocaleFromRequest(request: Request): Locale {
  const url = new URL(request.url);
  const localeParameter = url.searchParams.get('locale');

  if (isSupportedLocale(localeParameter)) {
    return localeParameter;
  }

  const acceptLanguage = request.headers.get('accept-language');

  if (acceptLanguage) {
    const preferred = acceptLanguage
      .split(',')
      .map(entry => entry.trim().split(';', 1)[0].split('-', 1)[0])
      .find((entry): entry is Locale => isSupportedLocale(entry));

    if (preferred) {
      return preferred;
    }
  }

  return DEFAULT_LOCALE;
}
