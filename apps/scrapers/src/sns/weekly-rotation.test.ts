import {describe, expect, it} from 'vitest';
import {pickWeeklyItem} from './weekly-rotation';

const lists = [{slug: 'a'}, {slug: 'b'}, {slug: 'c'}];

describe('pickWeeklyItem', () => {
  it('同じ週なら同じリストを選ぶ', () => {
    expect(pickWeeklyItem(lists, new Date('2026-09-05T03:00:00Z'))).toBe(
      pickWeeklyItem(lists, new Date('2026-09-06T23:00:00Z')),
    );
  });

  it('週が変わると次のリストに進む', () => {
    const first = pickWeeklyItem(lists, new Date('2026-09-05T03:00:00Z'));
    const second = pickWeeklyItem(lists, new Date('2026-09-12T03:00:00Z'));
    const third = pickWeeklyItem(lists, new Date('2026-09-19T03:00:00Z'));

    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('一巡すると最初に戻る', () => {
    expect(pickWeeklyItem(lists, new Date('2026-09-05T03:00:00Z'))).toBe(
      pickWeeklyItem(lists, new Date('2026-09-26T03:00:00Z')),
    );
  });

  it('リストが無ければ undefined', () => {
    expect(pickWeeklyItem([], new Date())).toBeUndefined();
  });
});
