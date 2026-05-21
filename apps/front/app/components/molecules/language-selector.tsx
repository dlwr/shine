type Language = {
  code: string;
  name: string;
  short: string;
};

type LanguageSelectorProperties = {
  locale: string;
};

const getCurrentUrl = (newLocale: string): string => {
  if (globalThis.window !== undefined) {
    const url = new URL(globalThis.location.href);
    url.searchParams.set('locale', newLocale);
    return url.toString();
  }

  return `?locale=${newLocale}`;
};

export function LanguageSelector({locale}: LanguageSelectorProperties) {
  const languages: Language[] = [
    {code: 'en', name: 'English', short: 'EN'},
    {code: 'ja', name: '日本語', short: 'JA'},
  ];

  return (
    <div className="flex gap-1">
      {languages.map(lang => (
        <a
          key={lang.code}
          href={getCurrentUrl(lang.code)}
          aria-label={lang.name}
          aria-current={locale === lang.code ? 'page' : undefined}
          className={`font-mono text-xs font-bold border-2 border-ink px-2 py-1 no-underline ${
            locale === lang.code ? 'bg-ink text-paper' : 'text-ink'
          }`}>
          {lang.short}
        </a>
      ))}
    </div>
  );
}
