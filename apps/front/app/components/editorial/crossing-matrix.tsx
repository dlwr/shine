export type CrossingAward = {
  key: string;
  shortLabel: string;
  name: string;
  count: number;
  href?: string;
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
  unit = '本',
}: {
  awards: CrossingAward[];
  pairs: CrossingPair[];
  unit?: string;
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
                key={award.key}
                scope="col"
                className="w-14 min-w-14 border-b-2 border-ink px-1 pb-1 pt-2 align-bottom font-normal leading-tight text-ink-muted">
                {award.shortLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {awards.map(rowAward => (
            <tr key={rowAward.key}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-r-2 border-ink bg-paper py-0.5 pr-2 text-right font-normal whitespace-nowrap">
                {rowAward.href ? (
                  <a href={rowAward.href} className="text-ink">
                    {rowAward.shortLabel}
                  </a>
                ) : (
                  rowAward.shortLabel
                )}
                <span className="ml-1.5 text-ink-muted">
                  {rowAward.count.toLocaleString('en-US')}
                </span>
              </th>
              {awards.map(columnAward => {
                if (rowAward.key === columnAward.key) {
                  return (
                    <td
                      key={columnAward.key}
                      className="h-8 bg-ink/10 text-center"
                    />
                  );
                }

                const shared = counts.get(`${rowAward.key} ${columnAward.key}`);
                const intensity = shared ? Math.sqrt(shared / max) : 0;

                return (
                  <td
                    key={columnAward.key}
                    title={`${rowAward.shortLabel} × ${columnAward.shortLabel} ${shared ?? 0}${unit}`}
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
