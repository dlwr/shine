export type AwardNomination = {
  uid: string;
  isWinner: boolean;
  specialMention?: string;
  person?: {uid: string; name: string};
  category: {name: string; displayName?: string};
  ceremony: {uid: string; year: number; number?: number};
  organization: {
    uid: string;
    name: string;
    shortName?: string;
    displayName?: string;
    slug?: string;
    hasYearPages?: boolean;
  };
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
    byOrg[orgKey] ??= {
      organization: nomination.organization,
      ceremonies: {},
    };

    const ceremonyKey = nomination.ceremony.uid;
    byOrg[orgKey].ceremonies[ceremonyKey] ??= {
      ceremony: nomination.ceremony,
      items: [],
    };

    byOrg[orgKey].ceremonies[ceremonyKey].items.push(nomination);
  }

  return (
    <div className="border border-ink">
      {Object.values(byOrg).map(group =>
        Object.values(group.ceremonies).map(({ceremony, items}) => (
          <div key={`${group.organization.uid}-${ceremony.uid}`}>
            {(() => {
              const headerText = `${
                group.organization.displayName ??
                group.organization.shortName ??
                group.organization.name
              } · ${ceremony.year}`;
              const slug = group.organization.slug;
              const href =
                slug && group.organization.hasYearPages
                  ? `/awards/${slug}/${ceremony.year}`
                  : slug && `/awards/${slug}`;
              return href ? (
                <a
                  href={href}
                  className="block bg-ink px-3 py-1 font-display text-xs font-extrabold text-paper no-underline">
                  {headerText}
                </a>
              ) : (
                <div className="bg-ink px-3 py-1 font-display text-xs font-extrabold text-paper">
                  {headerText}
                </div>
              );
            })()}
            {items.map(nomination => (
              <div
                key={nomination.uid}
                className="flex items-center justify-between border-b border-ink/20 px-3 py-1.5 text-sm last:border-b-0">
                <span>
                  {nomination.category.displayName ?? nomination.category.name}
                  {nomination.person && (
                    <a
                      href={`/people/${nomination.person.uid}`}
                      className="ml-2 text-ink underline">
                      {nomination.person.name}
                    </a>
                  )}
                  {nomination.specialMention && (
                    <span className="ml-2 font-label text-xs text-ink-muted">
                      {nomination.specialMention}
                    </span>
                  )}
                </span>
                {nomination.isWinner ? (
                  <span className="border border-brand px-1.5 py-0.5 font-display text-xs leading-none text-brand">
                    受賞
                  </span>
                ) : (
                  <span className="border border-ink-muted px-1.5 py-0.5 font-display text-xs leading-none text-ink-muted">
                    ノミネート
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
