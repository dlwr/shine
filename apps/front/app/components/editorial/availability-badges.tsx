export type AvailabilityInfo = {
  source: string;
  detail?: string;
  checkedAt: number;
};

type AvailabilityBadgesProperties = {
  availability?: AvailabilityInfo[];
  className?: string;
};

const sourceLabels: Record<string, string> = {
  tmdb: '配信',
  unext: 'U-NEXT',
  discas: 'TSUTAYA DISCAS',
  geo: 'ゲオ宅配レンタル',
};

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

  const latestCheckedAt = Math.max(
    ...availability.map(entry => entry.checkedAt),
  );

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {availability.map(entry => (
        <span
          key={entry.source}
          title={entry.detail}
          className="inline-flex items-center rounded-sm border border-ink-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
          {sourceLabels[entry.source] ?? entry.source}
        </span>
      ))}
      <span className="font-mono text-[10px] text-ink-muted/70">
        {formatCheckedDate(latestCheckedAt)} 時点
      </span>
    </div>
  );
}
