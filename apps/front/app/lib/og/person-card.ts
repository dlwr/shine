const TITLE_LIMIT = 2;
const WIN_WEIGHT = 1000;

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

  const score = (credit: CreditLike): number => {
    const contested = credit.awards.filter(award =>
      yearGrouped.has(award.slug),
    );
    const won = contested.filter(award => award.isWinner).length;

    return won * WIN_WEIGHT + contested.length;
  };

  return credits
    .filter(credit => credit.title !== undefined)
    .map((credit, index) => ({credit, index}))
    .toSorted((a, b) => score(b.credit) - score(a.credit) || a.index - b.index)
    .slice(0, TITLE_LIMIT)
    .map(entry => entry.credit.title!);
}
