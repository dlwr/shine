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

export type PersonalAward = {
  slug?: string;
  organization: string;
  category: string;
  year: number;
  isWinner: boolean;
};

export function Chip({
  label,
  title,
  isWinner,
}: {
  label: string;
  title: string;
  isWinner: boolean;
}) {
  return (
    <span
      title={title}
      className={
        isWinner
          ? 'bg-brand text-brand-on px-1 py-0.5 font-mono text-[10px]'
          : 'border border-ink-muted px-1 py-0.5 font-mono text-[10px] text-ink-muted'
      }>
      {label}
    </span>
  );
}

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
          <Chip
            key={tag.slug}
            label={award.shortLabel}
            title={`${awardHeading(award)} ${tag.isWinner ? '受賞' : '選出'}`}
            isWinner={tag.isWinner}
          />
        );
      })}
    </span>
  );
}

export function PersonalAwardTags({awards}: {awards: PersonalAward[]}) {
  if (awards.length === 0) {
    return;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {awards.map(award => (
        <Chip
          key={`${award.organization} ${award.category}`}
          label={award.category}
          title={`${award.organization} ${award.category} ${award.year}年 ${award.isWinner ? '受賞' : 'ノミネート'}`}
          isWinner={award.isWinner}
        />
      ))}
    </span>
  );
}
