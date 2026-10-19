import type {JapanAvailabilitySummaryData} from '@/lib/api-types';

export function hasJudgedAvailability(
  summary: JapanAvailabilitySummaryData | undefined,
): summary is JapanAvailabilitySummaryData {
  return (
    summary !== undefined &&
    summary.watchable + summary.rentalOnly + summary.unwatchable > 0
  );
}

export function AvailabilitySummaryLine({
  summary,
  unavailableHref,
  className = '',
}: {
  summary: JapanAvailabilitySummaryData | undefined;
  unavailableHref?: string;
  className?: string;
}) {
  if (!hasJudgedAvailability(summary)) {
    return;
  }

  const unavailableLabel = `観られない ${summary.unwatchable} 本`;

  return (
    <p
      className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm ${className}`}>
      <span className="font-bold">
        日本で観られる {summary.watchable} / {summary.total} 本
      </span>
      {summary.rentalOnly > 0 && (
        <span className="font-label text-xs text-ink-muted">
          宅配レンタルのみ {summary.rentalOnly} 本
        </span>
      )}
      {summary.unwatchable > 0 &&
        (unavailableHref ? (
          <a
            href={unavailableHref}
            className="font-label text-xs text-ink underline decoration-dotted underline-offset-2">
            {unavailableLabel}
          </a>
        ) : (
          <span className="font-label text-xs text-ink-muted">
            {unavailableLabel}
          </span>
        ))}
    </p>
  );
}
