import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {importJapaneseLabelsInBatches} from '../common/wikidata-sparql';

async function importWithFirstBatchFailing() {
  const applied: string[] = [];

  const stats = await importJapaneseLabelsInBatches({
    candidates: ['a', 'b', 'c'],
    subject: 'movies',
    emptyMessage: '',
    dryRun: false,
    batchSize: 2,
    throttleMs: 0,
    keyOf: candidate => candidate,
    async fetchLabels(keys) {
      if (keys.includes('a')) {
        throw new Error('503');
      }

      return new Map(keys.map(key => [key, `${key}-ja`]));
    },
    async apply(candidate, label) {
      applied.push(`${candidate}:${label}`);
    },
  });

  return {stats, applied};
}

describe('importJapaneseLabelsInBatches', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('取得に失敗したバッチの件数を failed に数える', async () => {
    const {stats} = await importWithFirstBatchFailing();

    expect(stats.failed).toBe(2);
  });

  it('取得に失敗しても次のバッチを反映する', async () => {
    const {applied} = await importWithFirstBatchFailing();

    expect(applied).toEqual(['c:c-ja']);
  });
});
