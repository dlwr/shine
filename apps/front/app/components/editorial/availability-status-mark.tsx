import type {JapanAvailabilityStatusData} from '@/lib/api-types';

const MARK_LABELS: Partial<Record<JapanAvailabilityStatusData, string>> = {
  unwatchable: '日本で観られない',
  rental_only: '宅配レンタルのみ・要確認',
};

export function AvailabilityStatusMark({
  status,
  className = '',
}: {
  status: JapanAvailabilityStatusData | undefined;
  className?: string;
}) {
  const label = status === undefined ? undefined : MARK_LABELS[status];
  if (!label) {
    return;
  }

  return (
    <span
      className={`inline-block border border-ink-muted/40 px-1 py-0.5 font-label text-[10px] leading-none text-ink-muted ${className}`}>
      {label}
    </span>
  );
}
