import {describe, expect, it} from 'vitest';
import {selectionDateKeys} from '../selection-dates';

describe('selectionDateKeys', () => {
  it('日替わりはその日をそのまま返す', () => {
    expect(selectionDateKeys('2026-09-18').daily).toBe('2026-09-18');
  });

  it('週替わりは直前の金曜を返す', () => {
    expect(selectionDateKeys('2026-09-18').weekly).toBe('2026-09-18');
    expect(selectionDateKeys('2026-09-19').weekly).toBe('2026-09-18');
    expect(selectionDateKeys('2026-09-17').weekly).toBe('2026-09-11');
  });

  it('週替わりは月をまたいでも直前の金曜を返す', () => {
    expect(selectionDateKeys('2026-10-01').weekly).toBe('2026-09-25');
  });

  it('月替わりはその月の1日を返す', () => {
    expect(selectionDateKeys('2026-09-18').monthly).toBe('2026-09-01');
  });
});
