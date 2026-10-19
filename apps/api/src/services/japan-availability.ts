import type {
  JapanAvailabilityStatus,
  JapanAvailabilitySummary,
} from '../types/common';

type LatestCheck = {source: string; status: string};

export function judgeJapanAvailability(
  latestChecks: readonly LatestCheck[],
): JapanAvailabilityStatus {
  const ok = latestChecks.filter(check => check.status === 'ok');
  if (ok.some(check => check.source !== 'discas')) {
    return 'watchable';
  }

  if (ok.length > 0) {
    return 'rental_only';
  }

  if (latestChecks.some(check => check.status === 'ng')) {
    return 'unwatchable';
  }

  return 'unchecked';
}

const SUMMARY_KEY: Record<
  JapanAvailabilityStatus,
  Exclude<keyof JapanAvailabilitySummary, 'total'>
> = {
  watchable: 'watchable',
  rental_only: 'rentalOnly',
  unwatchable: 'unwatchable',
  unchecked: 'unchecked',
};

export function summarizeJapanAvailability(
  statuses: Iterable<JapanAvailabilityStatus>,
): JapanAvailabilitySummary {
  const summary: JapanAvailabilitySummary = {
    total: 0,
    watchable: 0,
    rentalOnly: 0,
    unwatchable: 0,
    unchecked: 0,
  };
  for (const status of statuses) {
    summary.total += 1;
    summary[SUMMARY_KEY[status]] += 1;
  }

  return summary;
}
