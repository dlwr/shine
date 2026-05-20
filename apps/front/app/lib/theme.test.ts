import {describe, it, expect, beforeEach} from 'vitest';
import {resolveTheme, applyTheme, THEME_KEY} from './theme';

describe('resolveTheme', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('保存済みの値を優先する', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    expect(resolveTheme(false)).toBe('dark');
  });

  it('保存が無ければ OS 設定に追従する', () => {
    expect(resolveTheme(true)).toBe('dark');
    expect(resolveTheme(false)).toBe('light');
  });
});

describe('applyTheme', () => {
  it('dark を html クラスに付与し localStorage に保存する', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('light で dark クラスを外す', () => {
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });
});
