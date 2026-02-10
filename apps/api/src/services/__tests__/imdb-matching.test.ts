import {describe, expect, it} from 'vitest';
import {
  type ImdbNextData,
  extractImdbNominations,
  getMatchScore,
  normalizeCategoryName,
} from '../imdb-matching';

describe('normalizeCategoryName', () => {
  it('lowercases and trims input', () => {
    expect(normalizeCategoryName('  Best Picture  ')).toBe('best picture');
  });

  it('normalizes full-width parentheses', () => {
    expect(normalizeCategoryName('作品賞（最優秀作品）')).toBe(
      '作品賞(最優秀作品)',
    );
  });

  it('normalizes curly quotes', () => {
    expect(normalizeCategoryName('Best Picture\u2019s')).toBe("best picture's");
  });

  it('collapses whitespace', () => {
    expect(normalizeCategoryName('Best   Motion  Picture')).toBe(
      'best motion picture',
    );
  });
});

describe('getMatchScore', () => {
  it('returns 0 for exact match in targetNames', () => {
    const targets = new Set(['best picture']);
    expect(getMatchScore('Best Picture', targets)).toBe(0);
  });

  it('returns length difference for substring match (normalized includes candidate)', () => {
    const targets = new Set(['best film']);
    // "best film editing" (17) includes "best film" (9) -> diff = 8
    expect(getMatchScore('Best Film Editing', targets)).toBe(8);
  });

  it('returns length difference for substring match (candidate includes normalized)', () => {
    const targets = new Set(['academy award for best picture']);
    // candidate (30) includes "best picture" (12) -> diff = 18
    expect(getMatchScore('Best Picture', targets)).toBe(18);
  });

  it('returns Infinity for no match', () => {
    const targets = new Set(['best picture']);
    expect(getMatchScore('Best Cinematography', targets)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('returns best score among multiple targets', () => {
    const targets = new Set(['best picture', 'best film']);
    // "Best Picture" exact matches "best picture" -> 0
    expect(getMatchScore('Best Picture', targets)).toBe(0);
  });

  it('handles Japanese category names', () => {
    const targets = new Set(['最優秀作品賞']);
    expect(getMatchScore('最優秀作品賞', targets)).toBe(0);
  });
});

const buildImdbData = (
  categories: Array<{
    awardText?: string;
    categoryText: string;
    nominations: Array<{
      imdbId: string;
      title: string;
      isWinner: boolean;
    }>;
  }>,
): ImdbNextData => ({
  props: {
    pageProps: {
      edition: {
        awards: [
          {
            text: 'Academy Awards',
            nominationCategories: {
              edges: categories.map(cat => ({
                node: {
                  category: {text: cat.categoryText},
                  nominations: {
                    edges: cat.nominations.map(nom => ({
                      node: {
                        isWinner: nom.isWinner,
                        notes: undefined,
                        awardedEntities: {
                          awardTitles: [
                            {
                              title: {
                                id: nom.imdbId,
                                titleText: {text: nom.title},
                                originalTitleText: {text: nom.title},
                              },
                            },
                          ],
                        },
                      },
                    })),
                  },
                },
              })),
            },
          },
        ],
      },
    },
  },
});

describe('extractImdbNominations', () => {
  it('selects "Best Picture" over "Best Film Editing" when both present', () => {
    const data = buildImdbData([
      {
        categoryText: 'Best Film Editing',
        nominations: [
          {imdbId: 'tt0000001', title: 'Editing Movie', isWinner: false},
        ],
      },
      {
        categoryText: 'Best Picture',
        nominations: [
          {imdbId: 'tt0000002', title: 'Picture Movie', isWinner: true},
        ],
      },
    ]);

    const targets = new Set(['best picture', 'best film']);
    const result = extractImdbNominations(data, targets);

    expect(result.categoryName).toBe('Best Picture');
    expect(result.nominations).toHaveLength(1);
    expect(result.nominations[0].imdbId).toBe('tt0000002');
    expect(result.nominations[0].isWinner).toBe(true);
  });

  it('returns empty when no category matches', () => {
    const data = buildImdbData([
      {
        categoryText: 'Best Cinematography',
        nominations: [
          {imdbId: 'tt0000003', title: 'Some Movie', isWinner: false},
        ],
      },
    ]);

    const targets = new Set(['best picture']);
    const result = extractImdbNominations(data, targets);

    expect(result.nominations).toHaveLength(0);
    expect(result.categoryName).toBeUndefined();
  });

  it('handles exact match correctly', () => {
    const data = buildImdbData([
      {
        categoryText: 'Best Picture',
        nominations: [
          {imdbId: 'tt0000004', title: 'Winner Movie', isWinner: true},
          {imdbId: 'tt0000005', title: 'Nominee Movie', isWinner: false},
        ],
      },
    ]);

    const targets = new Set(['best picture']);
    const result = extractImdbNominations(data, targets);

    expect(result.categoryName).toBe('Best Picture');
    expect(result.nominations).toHaveLength(2);
  });

  it('prefers exact match even when fuzzy match appears first', () => {
    const data = buildImdbData([
      {
        categoryText: 'Best Film Editing',
        nominations: [
          {imdbId: 'tt0000006', title: 'Edit Movie', isWinner: false},
        ],
      },
      {
        categoryText: 'Best Film',
        nominations: [
          {imdbId: 'tt0000007', title: 'Film Movie', isWinner: true},
        ],
      },
    ]);

    const targets = new Set(['best film']);
    const result = extractImdbNominations(data, targets);

    expect(result.categoryName).toBe('Best Film');
    expect(result.nominations[0].imdbId).toBe('tt0000007');
  });

  it('falls back to award text when category text is missing', () => {
    const data: ImdbNextData = {
      props: {
        pageProps: {
          edition: {
            awards: [
              {
                text: 'Best Picture',
                nominationCategories: {
                  edges: [
                    {
                      node: {
                        category: {text: undefined},
                        nominations: {
                          edges: [
                            {
                              node: {
                                isWinner: true,
                                notes: undefined,
                                awardedEntities: {
                                  awardTitles: [
                                    {
                                      title: {
                                        id: 'tt0000008',
                                        titleText: {text: 'Fallback Movie'},
                                        originalTitleText: {
                                          text: 'Fallback Movie',
                                        },
                                      },
                                    },
                                  ],
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    const targets = new Set(['best picture']);
    const result = extractImdbNominations(data, targets);

    expect(result.nominations).toHaveLength(1);
    expect(result.nominations[0].imdbId).toBe('tt0000008');
  });

  it('returns empty nominations for empty awards array', () => {
    const data: ImdbNextData = {
      props: {pageProps: {edition: {awards: []}}},
    };

    const targets = new Set(['best picture']);
    const result = extractImdbNominations(data, targets);

    expect(result.nominations).toHaveLength(0);
  });
});
