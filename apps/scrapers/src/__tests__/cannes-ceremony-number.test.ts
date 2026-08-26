import {describe, expect, it} from 'vitest';
import {cannesCeremonyNumber, cannesCeremonyYear} from '../cannes-ceremony';

describe('cannesCeremonyNumber', () => {
  it('1946年は第1回', () => {
    expect(cannesCeremonyNumber(1946)).toBe(1);
  });

  it('1947年は第2回', () => {
    expect(cannesCeremonyNumber(1947)).toBe(2);
  });

  it('1949年は第3回', () => {
    expect(cannesCeremonyNumber(1949)).toBe(3);
  });

  it('1951年は第4回', () => {
    expect(cannesCeremonyNumber(1951)).toBe(4);
  });

  it('2023年は第76回', () => {
    expect(cannesCeremonyNumber(2023)).toBe(76);
  });

  it('中止された2020年も第73回として数える', () => {
    expect(cannesCeremonyNumber(2020)).toBe(73);
  });

  it('未開催の年は回次を持たない', () => {
    expect(cannesCeremonyNumber(1948)).toBeUndefined();
    expect(cannesCeremonyNumber(1950)).toBeUndefined();
    expect(cannesCeremonyNumber(1945)).toBeUndefined();
  });
});

describe('cannesCeremonyYear', () => {
  it('第1回は1946年', () => {
    expect(cannesCeremonyYear(1)).toBe(1946);
  });

  it('第2回は1947年', () => {
    expect(cannesCeremonyYear(2)).toBe(1947);
  });

  it('第3回は1949年', () => {
    expect(cannesCeremonyYear(3)).toBe(1949);
  });

  it('第4回は1951年', () => {
    expect(cannesCeremonyYear(4)).toBe(1951);
  });

  it('第76回は2023年', () => {
    expect(cannesCeremonyYear(76)).toBe(2023);
  });
});
