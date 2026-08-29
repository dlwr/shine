/**
 * 人名の旧字体・異体字。Unicodeの互換漢字はJSのNFKCで統合されないため、
 * 照合の前に自前で新字体へ寄せる（例: 山﨑努 と 山崎努、三國連太郎 と 三国連太郎）
 */
const VARIANTS: Record<string, string> = {
  﨑: '崎',
  國: '国',
  惠: '恵',
  眞: '真',
  瀨: '瀬',
  澤: '沢',
  邊: '辺',
  邉: '辺',
  濱: '浜',
  齋: '斎',
  齊: '斉',
  廣: '広',
  德: '徳',
  髙: '高',
  郞: '郎',
  彥: '彦',
  榮: '栄',
  應: '応',
  藝: '芸',
  圓: '円',
  莊: '荘',
  曉: '暁',
  龍: '竜',
  嶋: '島',
  嶌: '島',
  槇: '牧',
  聰: '聡',
  愼: '慎',
};

const VARIANT_PATTERN = new RegExp(`[${Object.keys(VARIANTS).join('')}]`, 'gu');

const LATIN_DIACRITICS = /[\u{300}-\u{36F}]/gu;

/** 表記ゆれの多い区切り記号。ハイフン・ピリオド・アポストロフィ・中黒 */
const SEPARATORS = /[\s\-\u{2010}-\u{2015}'’.·・]/gu;

export function normalizePersonName(name: string): string {
  return name
    .replaceAll(SEPARATORS, '')
    .normalize('NFKC')
    .replaceAll(VARIANT_PATTERN, character => VARIANTS[character])
    .normalize('NFD')
    .replaceAll(LATIN_DIACRITICS, '')
    .normalize('NFC')
    .toLowerCase();
}

/** 人名の部分一致に使う最小の長さ。短すぎると別人を掴む */
const MIN_CONTAINMENT_LENGTH = 3;

/**
 * 正規化した完全一致を優先し、無ければ包含関係で一意に決まるものを返す。
 * 「二代目 中村吉右衛門」「渡辺えり子」のような襲名・改名の表記差を吸収する
 */
export function matchPersonName<T>(
  name: string,
  candidates: Map<string, T>,
): T | undefined {
  const target = normalizePersonName(name);
  const exact = candidates.get(target);
  if (exact !== undefined) {
    return exact;
  }

  if (target.length < MIN_CONTAINMENT_LENGTH) {
    return undefined;
  }

  const matched = candidates
    .entries()
    .filter(
      ([candidate]) =>
        candidate.length >= MIN_CONTAINMENT_LENGTH &&
        (candidate.includes(target) || target.includes(candidate)),
    )
    .toArray();

  return matched.length === 1 ? matched[0][1] : undefined;
}
