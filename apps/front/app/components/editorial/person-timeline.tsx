import type {AwardTag, PersonalAward} from './award-tags';

export type TimelineCredit = {
  movieUid: string;
  title?: string;
  year?: number;
  awards: AwardTag[];
  personAwards: PersonalAward[];
};

type Honor = 'won' | 'nominated';

type TimelineEntry = {
  movieUid: string;
  title: string;
  year: number;
  honor?: Honor;
};

type TimelineDecade = {
  decade: number;
  entries: TimelineEntry[];
};

function honorOf(
  credit: TimelineCredit,
  yearGroupedSlugs: Set<string>,
): Honor | undefined {
  const contested = [
    ...credit.personAwards,
    ...credit.awards.filter(award => yearGroupedSlugs.has(award.slug)),
  ];
  if (contested.some(award => award.isWinner)) {
    return 'won';
  }

  return contested.length > 0 ? 'nominated' : undefined;
}

export function timelineDecades(
  credits: TimelineCredit[],
  yearGroupedSlugs: Set<string>,
): TimelineDecade[] {
  const decades = Map.groupBy(
    credits
      .filter(
        (credit): credit is TimelineCredit & {year: number} =>
          credit.year !== undefined,
      )
      .map(credit => ({
        movieUid: credit.movieUid,
        title: credit.title ?? 'Unknown Title',
        year: credit.year,
        honor: honorOf(credit, yearGroupedSlugs),
      }))
      .toSorted((a, b) => a.year - b.year),
    entry => Math.floor(entry.year / 10) * 10,
  );

  return decades
    .entries()
    .map(([decade, entries]) => ({decade, entries}))
    .toArray();
}

const HONOR_MARKS: Record<Honor, {mark: string; label: string}> = {
  won: {mark: '■', label: '受賞'},
  nominated: {mark: '□', label: 'ノミネート'},
};

function HonorMark({honor}: {honor: Honor}) {
  const {mark, label} = HONOR_MARKS[honor];
  return (
    <span role="img" aria-label={label} className="text-brand">
      {mark}
    </span>
  );
}

export function PersonTimeline({
  credits,
  yearGroupedSlugs,
}: {
  credits: TimelineCredit[];
  yearGroupedSlugs: Set<string>;
}) {
  const decades = timelineDecades(credits, yearGroupedSlugs);
  if (decades.flatMap(decade => decade.entries).length < 3) {
    return;
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 flex flex-wrap items-baseline gap-x-3 font-label text-xs text-ink-muted">
        <span>年表</span>
        <span className="text-[10px]">
          <HonorMark honor="won" /> 受賞 <HonorMark honor="nominated" />{' '}
          ノミネート
        </span>
      </h2>
      {decades.map(({decade, entries}) => (
        <div key={decade} className="flex gap-3 py-2 border-t-2 border-ink">
          <span className="w-16 shrink-0 font-display font-extrabold text-sm leading-tight tabular-nums">
            {decade}年代
            <span className="block font-label text-[10px] font-normal text-ink-muted">
              {entries.length}本
            </span>
          </span>
          <ul className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
            {entries.map(entry => (
              <li key={entry.movieUid} className="min-w-0 break-words">
                <a
                  href={`/movies/${entry.movieUid}`}
                  className="text-sm text-ink no-underline">
                  <span className="font-label text-[10px] text-ink-muted tabular-nums">
                    {entry.year}
                  </span>{' '}
                  {entry.title}
                  {entry.honor && (
                    <>
                      {' '}
                      <HonorMark honor={entry.honor} />
                    </>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
