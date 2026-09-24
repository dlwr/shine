import {describe, expect, it} from 'vitest';
import {addImportStats, emptyImportStats} from '../stats';

describe('emptyImportStats', () => {
  it('すべての件数が 0', () => {
    expect(Object.values(emptyImportStats())).toEqual(
      Array.from({length: 9}, () => 0),
    );
  });

  it('呼ぶたびに別のオブジェクトを返す', () => {
    const first = emptyImportStats();
    first.failed = 1;

    expect(emptyImportStats().failed).toBe(0);
  });
});

describe('addImportStats', () => {
  it('件数を項目ごとに足し込む', () => {
    const total = {...emptyImportStats(), moviesCreated: 2, failed: 1};

    addImportStats(total, {
      ...emptyImportStats(),
      moviesCreated: 3,
      peopleUnresolved: 4,
    });

    expect(total).toEqual({
      ...emptyImportStats(),
      moviesCreated: 5,
      peopleUnresolved: 4,
      failed: 1,
    });
  });
});
