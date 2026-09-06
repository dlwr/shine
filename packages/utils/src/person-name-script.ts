const LATIN_OR_JAPANESE =
  /^[\p{Script=Latin}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Common}\p{Script=Inherited}]*$/u;

export function hasOnlyLatinOrJapaneseScript(name: string): boolean {
  return LATIN_OR_JAPANESE.test(name);
}
