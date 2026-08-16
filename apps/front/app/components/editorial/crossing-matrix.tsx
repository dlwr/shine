export type CrossingAward = {
  slug: string;
  shortLabel: string;
  name: string;
  filmCount: number;
};

export type CrossingPair = {
  a: string;
  b: string;
  shared: number;
};

const DENSE_CELL_THRESHOLD = 0.55;

function sharedCounts(pairs: CrossingPair[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pair of pairs) {
    counts.set(`${pair.a} ${pair.b}`, pair.shared);
    counts.set(`${pair.b} ${pair.a}`, pair.shared);
  }

  return counts;
}

export function CrossingMatrix({
  awards,
  pairs,
}: {
  awards: CrossingAward[];
  pairs: CrossingPair[];
}) {
  const counts = sharedCounts(pairs);
  const max = Math.max(...pairs.map(pair => pair.shared), 1);

  return (
    <div className="overflow-x-auto border-2 border-ink">
      <table className="border-collapse font-mono text-[10px]">
        <thead>
          <tr>
            <td className="sticky left-0 z-10 bg-paper" />
            {awards.map(award => (
              <th
                key={award.slug}
                scope="col"
                className="w-14 min-w-14 border-b-2 border-ink px-1 pb-1 pt-2 align-bottom font-normal leading-tight text-ink-muted">
                {award.shortLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {awards.map(rowAward => (
            <tr key={rowAward.slug}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-r-2 border-ink bg-paper py-0.5 pr-2 text-right font-normal whitespace-nowrap">
                <a href={`/awards/${rowAward.slug}`} className="text-ink">
                  {rowAward.shortLabel}
                </a>
                <span className="ml-1.5 text-ink-muted">
                  {rowAward.filmCount.toLocaleString('en-US')}
                </span>
              </th>
              {awards.map(columnAward => {
                if (rowAward.slug === columnAward.slug) {
                  return (
                    <td
                      key={columnAward.slug}
                      className="h-8 bg-ink/10 text-center"
                    />
                  );
                }

                const shared = counts.get(
                  `${rowAward.slug} ${columnAward.slug}`,
                );
                const intensity = shared ? Math.sqrt(shared / max) : 0;

                return (
                  <td
                    key={columnAward.slug}
                    title={`${rowAward.shortLabel} × ${columnAward.shortLabel} ${shared ?? 0}本`}
                    className="h-8 text-center"
                    style={{
                      backgroundColor: `color-mix(in oklab, var(--brand) ${Math.round(
                        intensity * 88,
                      )}%, var(--paper))`,
                      color:
                        intensity > DENSE_CELL_THRESHOLD
                          ? 'var(--brand-on)'
                          : 'var(--ink)',
                    }}>
                    {shared ?? ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
