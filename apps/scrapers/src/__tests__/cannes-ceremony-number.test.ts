import {describe, expect, it} from 'vitest';
import {cannesCeremonyNumber} from '../cannes-film-festival';

describe('cannesCeremonyNumber', () => {
  it('第1回は1946年', () => {
    expect(cannesCeremonyNumber(1946)).toBe(1);
  });

  it('第2回は1947年', () => {
    expect(cannesCeremonyNumber(1947)).toBe(2);
  });

  it('1948年は未開催で第3回は1949年', () => {
    expect(cannesCeremonyNumber(1949)).toBe(3);
  });

  it('1950年は未開催で第4回は1951年', () => {
    expect(cannesCeremonyNumber(1951)).toBe(4);
  });

  it('2023年は第76回', () => {
    expect(cannesCeremonyNumber(2023)).toBe(76);
  });

  it('中止された2020年も第73回として数える', () => {
    expect(cannesCeremonyNumber(2020)).toBe(73);
  });

  it('未開催年はundefined', () => {
    expect(cannesCeremonyNumber(1948)).toBeUndefined();
    expect(cannesCeremonyNumber(1950)).toBeUndefined();
    expect(cannesCeremonyNumber(1945)).toBeUndefined();
  });
});
