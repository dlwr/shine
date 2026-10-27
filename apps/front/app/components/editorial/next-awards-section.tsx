import type {AwardSummaryData} from '@/lib/api-types';
import {awardHeading} from '@/lib/awards';
import type {NextAwards} from '@/lib/next-awards';

function AwardLinks({
  label,
  awards,
  text,
}: {
  label: string;
  awards: AwardSummaryData[];
  text: (award: AwardSummaryData) => string;
}) {
  if (awards.length === 0) {
    return;
  }

  return (
    <div className="mb-4">
      <h3 className="mb-2 font-label text-xs text-ink-muted">{label}</h3>
      <div className="flex flex-wrap gap-2">
        {awards.map(award => (
          <a
            key={award.slug}
            href={`/awards/${award.slug}`}
            className="inline-block border border-ink px-3 py-1.5 font-label text-xs font-bold no-underline text-ink">
            {text(award)}
          </a>
        ))}
      </div>
    </div>
  );
}

export function NextAwardsSection({next}: {next: NextAwards}) {
  if (
    next.sameOrganization.length === 0 &&
    next.otherOrganizations.length === 0
  ) {
    return;
  }

  return (
    <section className="mt-10 border-t-[3px] border-ink pt-2">
      <h2 className="mb-3 font-display font-bold text-xl">次に見る賞</h2>
      <AwardLinks
        label="同じ賞の他の部門"
        awards={next.sameOrganization}
        text={award => award.name}
      />
      <AwardLinks
        label="他の賞では"
        awards={next.otherOrganizations}
        text={awardHeading}
      />
    </section>
  );
}
