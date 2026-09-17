export function bigramPhrase(query: string): string | undefined {
  const characters = [...query];
  if (characters.length < 2) {
    return undefined;
  }

  const bigrams = characters
    .slice(1)
    .map((character, index) => `${characters[index]}${character}`);
  return `"${bigrams.join(' ').replaceAll('"', '""')}"`;
}
