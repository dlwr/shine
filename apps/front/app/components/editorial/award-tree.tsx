export type AwardNomination = {
  uid: string;
  isWinner: boolean;
  category: {name: string};
  ceremony: {uid: string; year: number; number?: number};
  organization: {uid: string; name: string; shortName?: string};
};

type Grouped = {
  organization: AwardNomination['organization'];
  ceremonies: Record<
    string,
    {ceremony: AwardNomination['ceremony']; items: AwardNomination[]}
  >;
};

export function AwardTree({nominations}: {nominations: AwardNomination[]}) {
  if (nominations.length === 0) {
    return;
  }

  const byOrg: Record<string, Grouped> = {};
  for (const nomination of nominations) {
    const orgKey = nomination.organization.uid;
    if (!byOrg[orgKey]) {
      byOrg[orgKey] = {organization: nomination.organization, ceremonies: {}};
    }

    const ceremonyKey = nomination.ceremony.uid;
    if (!byOrg[orgKey].ceremonies[ceremonyKey]) {
      byOrg[orgKey].ceremonies[ceremonyKey] = {
        ceremony: nomination.ceremony,
        items: [],
      };
    }

    byOrg[orgKey].ceremonies[ceremonyKey].items.push(nomination);
  }

  return (
    <div className="border-2 border-ink">
      {Object.values(byOrg).map(group =>
        Object.values(group.ceremonies).map(({ceremony, items}) => (
          <div key={`${group.organization.uid}-${ceremony.uid}`}>
            <div className="bg-ink px-3 py-1 font-display text-xs font-extrabold uppercase text-paper">
              {group.organization.shortName ?? group.organization.name} ·{' '}
              {ceremony.year}
            </div>
            {items.map(nomination => (
              <div
                key={nomination.uid}
                className="flex items-center justify-between border-b border-ink/20 px-3 py-1.5 text-sm last:border-b-0">
                <span>{nomination.category.name}</span>
                {nomination.isWinner ? (
                  <span className="bg-brand px-1.5 py-0.5 font-mono text-[10px] text-brand-on">
                    ★ WINNER
                  </span>
                ) : (
                  <span className="border border-ink-muted px-1.5 py-0.5 font-mono text-[10px]">
                    NOMINEE
                  </span>
                )}
              </div>
            ))}
          </div>
        )),
      )}
    </div>
  );
}
