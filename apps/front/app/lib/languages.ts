const TMDB_ONLY_CODES: Record<string, string> = {
  cn: '広東語',
  sh: 'セルビア・クロアチア語',
  xx: '言語なし',
};

const displayNames = new Intl.DisplayNames(['ja'], {
  type: 'language',
  fallback: 'code',
});

export function languageName(code: string): string {
  return TMDB_ONLY_CODES[code] ?? displayNames.of(code) ?? code;
}
