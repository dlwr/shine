import {type ImdbEventImportStats} from './types';

export function emptyImportStats(): ImdbEventImportStats {
  return {
    editionsProcessed: 0,
    moviesCreated: 0,
    moviesExisting: 0,
    skippedSoftDeleted: 0,
    nominationsCreated: 0,
    winnersUpdated: 0,
    tmdbNotFound: 0,
    peopleUnresolved: 0,
    failed: 0,
  };
}

export function addImportStats(
  total: ImdbEventImportStats,
  stats: ImdbEventImportStats,
): void {
  for (const key of Object.keys(total) as Array<keyof ImdbEventImportStats>) {
    total[key] += stats[key];
  }
}
