import type {AwardsCategory} from './types';

export const normalizeCategoryName = (value: string) => {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('’', "'")
    .replaceAll(/[（）]/g, match => (match === '（' ? '(' : ')'))
    .replaceAll(/\s+/g, ' ')
    .trim();
};

const synonyms = [
  'best film',
  'best picture',
  'best motion picture',
  'best motion picture of the year',
  'picture of the year',
  '最優秀作品賞',
  '最優秀作品',
  '作品賞',
  '最優秀作品賞(最優秀作品)',
  '最優秀作品賞 (最優秀作品)',
  '作品賞(最優秀作品)',
  '作品賞 (最優秀作品)',
  '最優秀日本作品賞',
  '最優秀日本映画賞',
];

export const findBestFilmCategory = (
  categories: AwardsCategory[],
  organizationUid: string,
): AwardsCategory | undefined => {
  if (!organizationUid) {
    return;
  }

  const normalizedSynonyms = new Set(
    synonyms.map(synonym => normalizeCategoryName(synonym)),
  );

  let bestMatch: AwardsCategory | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const category of categories) {
    if (category.organizationUid !== organizationUid) {
      continue;
    }

    const normalizedName = normalizeCategoryName(category.name);
    if (normalizedSynonyms.has(normalizedName)) {
      return category;
    }

    let score = Number.POSITIVE_INFINITY;
    for (const synonym of normalizedSynonyms) {
      if (normalizedName.includes(synonym)) {
        score = Math.min(score, normalizedName.length - synonym.length);
      }

      if (synonym.includes(normalizedName)) {
        score = Math.min(score, synonym.length - normalizedName.length);
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }

  return bestMatch;
};
