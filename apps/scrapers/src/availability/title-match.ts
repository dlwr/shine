export function hasJapaneseText(text: string): boolean {
  return /[぀-ヿ一-鿿]/.test(text);
}

const editionSuffixPatterns = [
  /(?:デジタル)?[・\s]*(?:リストア|リマスター)版$/,
  /(?:4k)[・\s]*(?:レストア|リマスター)版?$/,
  /ディレクターズ[・\s]*カット版?$/,
  /(?:字幕|吹替え?|完全|特別編集)版$/,
];

export function normalizeTitle(title: string): string {
  let result = title
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/【[^】]*】/g, ' ')
    .replaceAll(/[<＜][^>＞]*[>＞]/g, ' ')
    .replaceAll(/[・／/：:‐–—―-]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const pattern of editionSuffixPatterns) {
      const next = result.replace(pattern, '').trim();
      if (next !== result) {
        result = next;
        stripped = true;
      }
    }
  }

  return result;
}

export function titleMatches(
  candidate: string,
  targetTitles: string[],
): boolean {
  const normalizedCandidate = normalizeTitle(candidate).replaceAll(' ', '');
  if (normalizedCandidate === '') {
    return false;
  }

  return targetTitles.some(target => {
    const normalizedTarget = normalizeTitle(target).replaceAll(' ', '');
    return normalizedTarget !== '' && normalizedTarget === normalizedCandidate;
  });
}
