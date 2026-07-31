export type AvailabilityInfo = {
  source: string;
  detail?: string;
  checkedAt: number;
};

type AvailabilityBadgesProperties = {
  availability?: AvailabilityInfo[];
  className?: string;
};

type Badge = {
  label: string;
  title?: string;
};

// tmdbソースのdetail形式: "U-NEXT(見放題), Amazon Video(レンタル), ..."
function parseTmdbOfferings(detail: string): Array<{
  service: string;
  kind: string;
}> {
  return detail
    .split(', ')
    .map(entry =>
      /^(?<service>.+)\((?<kind>見放題|レンタル|購入)\)$/.exec(entry),
    )
    .filter(match => match !== null)
    .map(match => ({
      service: match.groups!.service,
      kind: match.groups!.kind,
    }));
}

export function buildBadges(availability: AvailabilityInfo[]): Badge[] {
  const badges: Badge[] = [];

  const tmdb = availability.find(entry => entry.source === 'tmdb');
  const offerings = tmdb?.detail ? parseTmdbOfferings(tmdb.detail) : [];
  const subscriptionServices = [
    ...new Set(
      offerings
        .filter(offering => offering.kind === '見放題')
        .map(offering => offering.service),
    ),
  ];
  for (const service of subscriptionServices) {
    badges.push({label: `${service} 見放題`, title: tmdb?.detail});
  }

  const paidOfferings = offerings.filter(
    offering => offering.kind !== '見放題',
  );
  if (subscriptionServices.length === 0 && paidOfferings.length > 0) {
    badges.push({
      label: 'レンタル配信あり',
      title: paidOfferings
        .map(offering => `${offering.service}(${offering.kind})`)
        .join(', '),
    });
  }

  const unext = availability.find(entry => entry.source === 'unext');
  if (unext && !subscriptionServices.includes('U-NEXT')) {
    badges.push({label: 'U-NEXT', title: unext.detail});
  }

  const rentalLabels = [
    availability.some(entry => entry.source === 'discas')
      ? 'TSUTAYA DISCAS'
      : undefined,
    availability.some(entry => entry.source === 'geo')
      ? 'ゲオ宅配レンタル'
      : undefined,
  ].filter(label => label !== undefined);
  if (rentalLabels.length > 0) {
    badges.push({label: '宅配レンタル', title: rentalLabels.join(' / ')});
  }

  return badges;
}

function formatCheckedDate(checkedAt: number): string {
  return new Date(checkedAt * 1000).toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Tokyo',
  });
}

export function AvailabilityBadges({
  availability,
  className = '',
}: AvailabilityBadgesProperties) {
  if (!availability || availability.length === 0) {
    return;
  }

  const badges = buildBadges(availability);
  if (badges.length === 0) {
    return;
  }

  const latestCheckedAt = Math.max(
    ...availability.map(entry => entry.checkedAt),
  );

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {badges.map(badge => (
        <span
          key={badge.label}
          title={badge.title}
          className="inline-flex items-center rounded-sm border border-ink-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
          {badge.label}
        </span>
      ))}
      <span className="font-mono text-[10px] text-ink-muted/70">
        {formatCheckedDate(latestCheckedAt)} 時点
      </span>
    </div>
  );
}
