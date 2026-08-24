const TITLE_LIMIT = 2;

type CreditLike = {
  title?: string;
  awards: Array<{slug: string; isWinner: boolean}>;
};

type LegendLike = {
  slug: string;
  grouping: 'year' | 'list';
};

export function pickRepresentativeTitles(
  credits: CreditLike[],
  legend: LegendLike[],
): string[] {
  const yearGrouped = new Set(
    legend.filter(award => award.grouping === 'year').map(award => award.slug),
  );

  const rank = (credit: CreditLike): number => {
    const contested = credit.awards.filter(award =>
      yearGrouped.has(award.slug),
    );
    if (contested.some(award => award.isWinner)) {
      return 0;
    }

    return contested.length > 0 ? 1 : 2;
  };

  return credits
    .filter(credit => credit.title !== undefined)
    .map((credit, index) => ({credit, index}))
    .toSorted((a, b) => rank(a.credit) - rank(b.credit) || a.index - b.index)
    .slice(0, TITLE_LIMIT)
    .map(entry => entry.credit.title!);
}
