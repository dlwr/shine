import {describe, expect, it} from 'vitest';
import {D1_MAX_BOUND_PARAMETERS, inChunks} from '../src/index';

type FakeQuery = Promise<number[]> & {toSQL(): {params: unknown[]}};

const fakeQuery = (
  chunk: number[],
  otherParameters: number,
  calls: number[][],
): FakeQuery => {
  calls.push(chunk);
  return Object.assign(Promise.resolve(chunk.map(value => value * 10)), {
    toSQL: () => ({
      params: [...chunk, ...Array.from({length: otherParameters})],
    }),
  });
};

const values = Array.from({length: 200}, (_, index) => index);

describe('inChunks', () => {
  it('keeps every statement within the bound parameter limit', async () => {
    const calls: number[][] = [];

    await inChunks(values, chunk => fakeQuery(chunk, 3, calls));

    expect(
      calls.every(chunk => chunk.length + 3 <= D1_MAX_BOUND_PARAMETERS),
    ).toBe(true);
  });

  it('queries every value exactly once', async () => {
    const calls: number[][] = [];

    await inChunks(values, chunk => fakeQuery(chunk, 3, calls));

    expect(calls.slice(1).flat()).toEqual(values);
  });

  it('concatenates the rows of every chunk in order', async () => {
    const rows = await inChunks(values, chunk => fakeQuery(chunk, 3, []));

    expect(rows).toEqual(values.map(value => value * 10));
  });

  it('does not query for an empty list', async () => {
    const calls: number[][] = [];

    await inChunks([], chunk => fakeQuery(chunk, 3, calls));

    expect(calls).toEqual([]);
  });
});
