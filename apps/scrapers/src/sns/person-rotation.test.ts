import {describe, expect, it} from 'vitest';
import {pickPersonOfWeek} from './person-rotation';

const prominent = {
  directors: [
    {uid: 'z-director', wonCount: 5},
    {uid: 'a-director', wonCount: 1},
    {uid: 'n-director', wonCount: 0},
  ],
  actors: [
    {uid: 'm-actor', wonCount: 3},
    {uid: 'b-actor', wonCount: 0},
  ],
};

const week = (offset: number) =>
  new Date(Date.UTC(2026, 8, 3) + offset * 7 * 24 * 60 * 60 * 1000);

describe('pickPersonOfWeek', () => {
  it('選んだ人物に役割を付ける', () => {
    const picks = [0, 1, 2].map(offset =>
      pickPersonOfWeek(prominent, week(offset)),
    );

    expect(picks.find(pick => pick?.uid === 'm-actor')?.role).toBe('actor');
    expect(picks.find(pick => pick?.uid === 'z-director')?.role).toBe(
      'director',
    );
  });

  it('受賞が無い人物は選ばない', () => {
    const uids = new Set(
      Array.from(
        {length: 10},
        (_, offset) => pickPersonOfWeek(prominent, week(offset))?.uid,
      ),
    );

    expect(uids).toEqual(new Set(['a-director', 'm-actor', 'z-director']));
  });

  it('同じ週なら同じ人物を選ぶ', () => {
    expect(pickPersonOfWeek(prominent, week(0))?.uid).toBe(
      pickPersonOfWeek(
        prominent,
        new Date(week(0).getTime() + 3 * 24 * 60 * 60 * 1000),
      )?.uid,
    );
  });

  it('順番はランキングではなく uid で決めて有名人が続かないようにする', () => {
    const uids = [0, 1, 2].map(
      offset => pickPersonOfWeek(prominent, week(offset))!.uid,
    );
    const start = uids.indexOf('a-director');

    expect(start).toBeGreaterThanOrEqual(0);
    expect(uids[(start + 1) % 3]).toBe('m-actor');
    expect(uids[(start + 2) % 3]).toBe('z-director');
  });

  it('受賞者がいなければ undefined', () => {
    expect(
      pickPersonOfWeek({directors: [], actors: []}, week(0)),
    ).toBeUndefined();
  });
});
