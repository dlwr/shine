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

function candidateVariants(candidate: string): string[] {
  const variants = [candidate];
  const parenSegments = [...candidate.matchAll(/[（(]([^）)]+)[）)]/g)];
  if (parenSegments.length > 0) {
    variants.push(
      candidate.replaceAll(/[（(][^）)]*[）)]/g, ' '),
      ...parenSegments.map(segment => segment[1]),
    );
  }

  return variants;
}

function comparisonKey(title: string): string {
  return normalizeTitle(title)
    .replaceAll(' ', '')
    .replace(/[!?]+$/, '');
}

export function titleMatches(
  candidate: string,
  targetTitles: string[],
): boolean {
  const candidateKeys = candidateVariants(candidate)
    .map(variant => comparisonKey(variant))
    .filter(key => key !== '');
  if (candidateKeys.length === 0) {
    return false;
  }

  return targetTitles.some(target => {
    const targetKey = comparisonKey(target);
    return targetKey !== '' && candidateKeys.includes(targetKey);
  });
}
