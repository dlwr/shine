import {describe, expect, it} from 'vitest';
import {pickWatchedList} from './watched-rotation';

const lists = [{slug: 'a'}, {slug: 'b'}, {slug: 'c'}];

describe('pickWatchedList', () => {
  it('同じ週なら同じリストを選ぶ', () => {
    expect(pickWatchedList(lists, new Date('2026-09-05T03:00:00Z'))).toBe(
      pickWatchedList(lists, new Date('2026-09-06T23:00:00Z')),
    );
  });

  it('週が変わると次のリストに進む', () => {
    const first = pickWatchedList(lists, new Date('2026-09-05T03:00:00Z'));
    const second = pickWatchedList(lists, new Date('2026-09-12T03:00:00Z'));
    const third = pickWatchedList(lists, new Date('2026-09-19T03:00:00Z'));

    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('一巡すると最初に戻る', () => {
    expect(pickWatchedList(lists, new Date('2026-09-05T03:00:00Z'))).toBe(
      pickWatchedList(lists, new Date('2026-09-26T03:00:00Z')),
    );
  });

  it('リストが無ければ undefined', () => {
    expect(pickWatchedList([], new Date())).toBeUndefined();
  });
});
