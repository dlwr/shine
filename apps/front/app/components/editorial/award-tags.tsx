import {awardHeading} from '@/lib/awards';

export type AwardTag = {
  slug: string;
  isWinner: boolean;
};

export type AwardTagLegend = {
  slug: string;
  shortLabel: string;
  name: string;
  organization: string;
};

export function AwardTags({
  tags,
  legend,
}: {
  tags: AwardTag[];
  legend: AwardTagLegend[];
}) {
  if (tags.length === 0) {
    return;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {tags.map(tag => {
        const award = legend.find(item => item.slug === tag.slug);
        if (!award) {
          return;
        }

        return (
          <span
            key={tag.slug}
            title={`${awardHeading(award)} ${tag.isWinner ? '受賞' : '選出'}`}
            className={
              tag.isWinner
                ? 'bg-brand text-brand-on px-1 py-0.5 font-mono text-[10px]'
                : 'border border-ink-muted px-1 py-0.5 font-mono text-[10px] text-ink-muted'
            }>
            {award.shortLabel}
          </span>
        );
      })}
    </span>
  );
}
