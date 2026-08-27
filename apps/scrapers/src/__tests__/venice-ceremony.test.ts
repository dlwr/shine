import {describe, expect, it} from 'vitest';
import {veniceCeremonyNumber, veniceCeremonyYear} from '../venice-ceremony';

describe('veniceCeremonyNumber', () => {
  it('第1回は1932年', () => {
    expect(veniceCeremonyNumber(1932)).toBe(1);
  });

  it('1934〜1939年は年-1932', () => {
    expect(veniceCeremonyNumber(1934)).toBe(2);
    expect(veniceCeremonyNumber(1939)).toBe(7);
  });

  it('戦時中の1940〜1942年は公式回次に数えない', () => {
    expect(veniceCeremonyNumber(1940)).toBeUndefined();
    expect(veniceCeremonyNumber(1942)).toBeUndefined();
  });

  it('1946年は公式回次に数えない', () => {
    expect(veniceCeremonyNumber(1946)).toBeUndefined();
  });

  it('1947〜1972年は年-1939', () => {
    expect(veniceCeremonyNumber(1947)).toBe(8);
    expect(veniceCeremonyNumber(1949)).toBe(10);
    expect(veniceCeremonyNumber(1968)).toBe(29);
    expect(veniceCeremonyNumber(1972)).toBe(33);
  });

  it('未開催の1973・1974・1977・1978年はundefined', () => {
    expect(veniceCeremonyNumber(1973)).toBeUndefined();
    expect(veniceCeremonyNumber(1974)).toBeUndefined();
    expect(veniceCeremonyNumber(1977)).toBeUndefined();
    expect(veniceCeremonyNumber(1978)).toBeUndefined();
  });

  it('非競争で開催された1975年は第34回、1976年は第35回', () => {
    expect(veniceCeremonyNumber(1975)).toBe(34);
    expect(veniceCeremonyNumber(1976)).toBe(35);
  });

  it('1979年は第36回', () => {
    expect(veniceCeremonyNumber(1979)).toBe(36);
  });

  it('1980年以降は年-1943', () => {
    expect(veniceCeremonyNumber(1980)).toBe(37);
    expect(veniceCeremonyNumber(2025)).toBe(82);
    expect(veniceCeremonyNumber(2026)).toBe(83);
  });
});

describe('veniceCeremonyYear', () => {
  it('第1回は1932年', () => {
    expect(veniceCeremonyYear(1)).toBe(1932);
  });

  it('第2〜7回は1934〜1939年', () => {
    expect(veniceCeremonyYear(2)).toBe(1934);
    expect(veniceCeremonyYear(7)).toBe(1939);
  });

  it('第8〜33回は1947〜1972年', () => {
    expect(veniceCeremonyYear(8)).toBe(1947);
    expect(veniceCeremonyYear(33)).toBe(1972);
  });

  it('第34回は1975年、第35回は1976年', () => {
    expect(veniceCeremonyYear(34)).toBe(1975);
    expect(veniceCeremonyYear(35)).toBe(1976);
  });

  it('第36回は1979年', () => {
    expect(veniceCeremonyYear(36)).toBe(1979);
  });

  it('第37回以降は回次+1943', () => {
    expect(veniceCeremonyYear(37)).toBe(1980);
    expect(veniceCeremonyYear(82)).toBe(2025);
  });

  it('開催された年は回次を経由して元の年に戻る', () => {
    for (const year of [1932, 1938, 1947, 1972, 1975, 1976, 1979, 2026]) {
      expect(veniceCeremonyYear(veniceCeremonyNumber(year)!)).toBe(year);
    }
  });
});
