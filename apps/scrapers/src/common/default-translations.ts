type TranslationRow = {
  resourceType: string;
  languageCode: string;
};

export function withDefaultTranslationFlags<T extends TranslationRow>(
  originalLanguage: string,
  rows: T[],
): Array<T & {isDefault: number}> {
  const defaultRows = new Map<string, T>();
  for (const row of rows) {
    const current = defaultRows.get(row.resourceType);
    if (
      current === undefined ||
      (current.languageCode !== originalLanguage &&
        (row.languageCode === originalLanguage ||
          (row.languageCode === 'en' && current.languageCode !== 'en')))
    ) {
      defaultRows.set(row.resourceType, row);
    }
  }

  return rows.map(row => ({
    ...row,
    isDefault: defaultRows.get(row.resourceType) === row ? 1 : 0,
  }));
}
