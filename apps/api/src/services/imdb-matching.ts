export type ImdbNextData = {
  props?: {
    pageProps?: {
      edition?: {
        awards?: Array<{
          text?: string | null;
          nominationCategories?: {
            edges?: Array<{
              node?: {
                category?: {text?: string | null};
                nominations?: {
                  edges?: Array<{
                    node?: {
                      isWinner?: boolean | null;
                      notes?: unknown;
                      awardedEntities?: {
                        awardTitles?: Array<{
                          title?: {
                            id?: string | null;
                            titleText?: {text?: string | null};
                            originalTitleText?: {
                              text?: string | null;
                            };
                          };
                        }>;
                      };
                    };
                  }>;
                };
              };
            }>;
          };
        }>;
      };
    };
  };
};

export type ImdbNomination = {
  imdbId?: string;
  title?: string;
  isWinner: boolean;
  notes?: string;
};

export const normalizeCategoryName = (value: string): string =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('\u2019', "'")
    .replaceAll(/[（）]/g, match => (match === '（' ? '(' : ')'))
    .replaceAll(/\s+/g, ' ')
    .trim();

export const extractNoteText = (note: unknown): string | undefined => {
  if (typeof note === 'string') {
    const trimmed = note.trim();
    return trimmed === '' ? undefined : trimmed;
  }

  if (note && typeof note === 'object') {
    const plainText =
      (typeof (note as {plainText?: unknown}).plainText === 'string'
        ? (note as {plainText: string}).plainText
        : undefined) ??
      (typeof (note as {value?: {plainText?: unknown}}).value?.plainText ===
      'string'
        ? (note as {value: {plainText: string}}).value.plainText
        : undefined);

    if (plainText) {
      const trimmed = plainText.trim();
      return trimmed === '' ? undefined : trimmed;
    }
  }

  return undefined;
};

export const getMatchScore = (
  name: string,
  targetNames: Set<string>,
): number => {
  const normalized = normalizeCategoryName(name);
  if (targetNames.has(normalized)) {
    return 0;
  }

  let best = Number.POSITIVE_INFINITY;
  for (const candidate of targetNames) {
    if (normalized.includes(candidate)) {
      best = Math.min(best, normalized.length - candidate.length);
    }

    if (candidate.includes(normalized)) {
      best = Math.min(best, candidate.length - normalized.length);
    }
  }

  return best;
};

export const extractImdbNominations = (
  data: ImdbNextData,
  targetNames: Set<string>,
): {categoryName?: string; nominations: ImdbNomination[]} => {
  const awards = data?.props?.pageProps?.edition?.awards ?? [];

  const categoryEdges = awards.flatMap(award => {
    const edges = award?.nominationCategories?.edges ?? [];
    return edges.map(edge => ({edge, award}));
  });

  let targetEntry: (typeof categoryEdges)[number] | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const entry of categoryEdges) {
    const categoryName = entry.edge?.node?.category?.text;
    const awardName = entry.award?.text;

    let score = Number.POSITIVE_INFINITY;
    if (typeof categoryName === 'string' && categoryName.trim() !== '') {
      score = getMatchScore(categoryName, targetNames);
    }

    if (
      score === Number.POSITIVE_INFINITY &&
      typeof awardName === 'string' &&
      awardName.trim() !== ''
    ) {
      score = getMatchScore(awardName, targetNames);
    }

    if (score < bestScore) {
      bestScore = score;
      targetEntry = entry;
      if (bestScore === 0) {
        break;
      }
    }
  }

  if (!targetEntry?.edge?.node) {
    return {nominations: []};
  }

  const nominations: ImdbNomination[] = [];
  const nominationEdges = targetEntry.edge.node.nominations?.edges ?? [];

  for (const edge of nominationEdges) {
    const node = edge?.node;
    if (!node) {
      continue;
    }

    const titleInfo = node.awardedEntities?.awardTitles?.[0]?.title;
    const imdbId =
      typeof titleInfo?.id === 'string' ? titleInfo.id.trim() : undefined;
    const englishTitle =
      typeof titleInfo?.titleText?.text === 'string'
        ? titleInfo.titleText.text.trim()
        : undefined;
    const originalTitle =
      typeof titleInfo?.originalTitleText?.text === 'string'
        ? titleInfo.originalTitleText.text.trim()
        : undefined;

    nominations.push({
      imdbId: imdbId && imdbId !== '' ? imdbId : undefined,
      title: englishTitle && englishTitle !== '' ? englishTitle : originalTitle,
      isWinner: Boolean(node.isWinner),
      notes: extractNoteText(node.notes),
    });
  }

  const resolvedCategoryName =
    typeof targetEntry.edge.node.category?.text === 'string' &&
    targetEntry.edge.node.category.text.trim() !== ''
      ? targetEntry.edge.node.category.text
      : typeof targetEntry.award?.text === 'string' &&
          targetEntry.award.text.trim() !== ''
        ? targetEntry.award.text
        : undefined;

  return {
    categoryName: resolvedCategoryName,
    nominations,
  };
};
