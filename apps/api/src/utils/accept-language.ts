function sortLanguagesByQuality(
  languages: Array<{code: string; quality: number}>,
) {
  const sorted: Array<{code: string; quality: number}> = [];
  for (const language of languages) {
    const insertIndex = sorted.findIndex(
      current => current.quality < language.quality,
    );
    if (insertIndex === -1) {
      sorted.push(language);
    } else {
      sorted.splice(insertIndex, 0, language);
    }
  }
  return sorted;
}

export function parseAcceptLanguage(acceptLanguage?: string): string[] {
  if (!acceptLanguage) {
    return [];
  }

  const languages = acceptLanguage.split(',').map(entry => {
    const [code, quality] = entry.trim().split(';q=', 2);
    return {
      code: code.split('-', 1)[0],
      quality: quality ? Number(quality) : 1,
    };
  });
  const sortedLanguages = sortLanguagesByQuality(languages);
  return sortedLanguages.map(language => language.code);
}
