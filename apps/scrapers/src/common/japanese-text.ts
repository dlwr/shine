export function hasKana(text: string): boolean {
  return /[ぁ-ゖァ-ヶー]/.test(text);
}
