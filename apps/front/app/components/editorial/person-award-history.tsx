import {Chip, type PersonalAward} from './award-tags';

export type AwardHistoryCredit = {
  movieUid: string;
  title?: string;
  year?: number;
  personAwards: PersonalAward[];
};

const ORGANIZATION_SHORT_LABELS = new Map([
  ['アカデミー賞', 'アカデミー'],
  ['英国アカデミー賞', 'BAFTA'],
  ['ゴールデングローブ賞', 'GG'],
  ['カンヌ国際映画祭', 'カンヌ'],
  ['ヴェネツィア国際映画祭', 'ヴェネツィア'],
  ['ベルリン国際映画祭', 'ベルリン'],
  ['日本アカデミー賞', '日本アカデミー'],
  ['キネマ旬報', 'キネ旬'],
  ['毎日映画コンクール', '毎日'],
  ['ブルーリボン賞', 'ブルーリボン'],
  ['報知映画賞', '報知'],
]);

const CATEGORY_LABELS = ['助演', '主演', '監督', '男優', '女優'];

function categoryLabel(category: string): string {
  return (
    CATEGORY_LABELS.find(label => category.includes(label)) ??
    category.replace(/（.*）/, '').replace(/賞$/, '')
  );
}

type Column = {
  organization: string;
  shortLabel: string;
};

function organizationRank(organization: string): number {
  const rank = ORGANIZATION_SHORT_LABELS.keys().toArray().indexOf(organization);
  return rank === -1 ? Infinity : rank;
}

function columnsOf(credits: AwardHistoryCredit[]): Column[] {
  const organizations = new Set(
    credits.flatMap(credit =>
      credit.personAwards.map(award => award.organization),
    ),
  );

  return organizations
    .values()
    .toArray()
    .toSorted((a, b) => organizationRank(a) - organizationRank(b))
    .map(organization => ({
      organization,
      shortLabel: ORGANIZATION_SHORT_LABELS.get(organization) ?? organization,
    }));
}

export function PersonAwardHistory({credits}: {credits: AwardHistoryCredit[]}) {
  const rows = credits.filter(credit => credit.personAwards.length > 0);
  if (rows.length === 0) {
    return;
  }

  const columns = columnsOf(rows);

  return (
    <div className="overflow-x-auto border-2 border-ink">
      <table className="border-collapse font-mono text-[10px]">
        <thead>
          <tr>
            <td className="sticky left-0 z-10 bg-paper" />
            {columns.map(column => (
              <th
                key={column.organization}
                scope="col"
                className="w-14 min-w-14 border-b-2 border-ink px-1 pb-1 pt-2 align-bottom font-normal leading-tight text-ink-muted">
                {column.shortLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(credit => (
            <tr key={credit.movieUid}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-r-2 border-ink bg-paper py-1 pr-2 text-left font-normal whitespace-nowrap">
                {credit.year && (
                  <span className="mr-1.5 text-ink-muted tabular-nums">
                    {credit.year}
                  </span>
                )}
                <a
                  href={`/movies/${credit.movieUid}`}
                  title={credit.title}
                  className="inline-block max-w-36 truncate align-bottom text-ink no-underline md:max-w-56">
                  {credit.title ?? 'Unknown Title'}
                </a>
              </th>
              {columns.map(column => (
                <td key={column.organization} className="h-7 px-1 text-center">
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {credit.personAwards
                      .filter(
                        award => award.organization === column.organization,
                      )
                      .map(award => (
                        <Chip
                          key={`${award.category} ${award.year}`}
                          label={categoryLabel(award.category)}
                          title={`${award.organization} ${award.category} ${award.year}年 ${award.isWinner ? '受賞' : 'ノミネート'}`}
                          isWinner={award.isWinner}
                        />
                      ))}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
