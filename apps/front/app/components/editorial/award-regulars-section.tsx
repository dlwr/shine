import type {AwardRegular} from '@/lib/award-regulars';

function regularRecord({wins, nominations}: AwardRegular): string {
  if (wins === nominations) {
    return `受賞 ${wins}`;
  }

  return wins > 0
    ? `受賞 ${wins}・ノミネート ${nominations}`
    : `ノミネート ${nominations}`;
}

export function AwardRegularsSection({regulars}: {regulars: AwardRegular[]}) {
  if (regulars.length === 0) {
    return;
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 font-label text-xs text-ink-muted">この部門の常連</h2>
      {regulars.map(regular => (
        <a
          key={regular.uid}
          href={`/people/${regular.uid}`}
          className="flex items-baseline gap-3 py-2 border-t-2 border-ink no-underline text-ink">
          <span className="min-w-0 flex-1 font-display font-extrabold text-sm leading-none break-words">
            {regular.name}
          </span>
          <span className="font-label text-xs text-ink-muted shrink-0 tabular-nums">
            {regularRecord(regular)}
          </span>
        </a>
      ))}
    </section>
  );
}
