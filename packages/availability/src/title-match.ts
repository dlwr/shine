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

  let isStripped = true;
  while (isStripped) {
    isStripped = false;
    for (const pattern of editionSuffixPatterns) {
      const next = result.replace(pattern, '').trim();
      if (next !== result) {
        result = next;
        isStripped = true;
      }
    }
  }

  return result;
}

// 《》は版表記などの注釈にしか使われないため、除去のみ行い中身は照合しない
const annotationPattern = /[（(《][^）)》]*[）)》]/g;
const parenthesizedTitlePattern = /[（(]([^）)]+)[）)]/g;

function candidateVariants(candidate: string): string[] {
  const variants = [candidate];

  const withoutAnnotations = candidate.replaceAll(annotationPattern, ' ');
  if (withoutAnnotations !== candidate) {
    variants.push(withoutAnnotations);
  }

  variants.push(
    ...candidate
      .matchAll(parenthesizedTitlePattern)
      .map(segment => segment[1]),
  );

  return variants;
}

function comparisonKey(title: string): string {
  return normalizeTitle(title)
    .replaceAll(' ', '')
    .replace(/[!?]+$/, '');
}

function matchesAnyTarget(
  candidateKeys: string[],
  targetTitles: string[],
): boolean {
  if (candidateKeys.length === 0) {
    return false;
  }

  return targetTitles.some(target => {
    const targetKey = comparisonKey(target);
    return targetKey !== '' && candidateKeys.includes(targetKey);
  });
}

export function matchesTitle(
  candidate: string,
  targetTitles: string[],
): boolean {
  const candidateKeys = candidateVariants(candidate)
    .map(variant => comparisonKey(variant))
    .filter(key => key !== '');

  return matchesAnyTarget(candidateKeys, targetTitles);
}

const volumeMarkerPattern =
  /^(?:(?:vol\.?|第)?(?:\d+|[一二三四五六七八九十]+)(?:部|巻|集|話|章)?|前編|後編|上巻|下巻)$/;

// 分売された作品は「本編タイトル + 巻数 + サブタイトル」で登録される。
// 巻数のあとにサブタイトルが続くことを必須にして、続編（PART II 等）と区別する
export function volumeBaseTitles(candidate: string): string[] {
  const tokens = normalizeTitle(candidate)
    .split(' ')
    .filter(token => token !== '');

  const bases: string[] = [];
  for (let index = 1; index < tokens.length - 1; index++) {
    if (volumeMarkerPattern.test(tokens[index])) {
      bases.push(tokens.slice(0, index).join(' '));
    }
  }

  return bases;
}

export function matchesTitleAsVolume(
  candidate: string,
  targetTitles: string[],
): boolean {
  const baseKeys = volumeBaseTitles(candidate)
    .map(base => comparisonKey(base))
    .filter(key => key !== '');

  return matchesAnyTarget(baseKeys, targetTitles);
}
