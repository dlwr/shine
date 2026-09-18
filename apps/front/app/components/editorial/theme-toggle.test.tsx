import {describe, it, expect, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import '@testing-library/jest-dom';
import {ThemeToggle} from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('クリックで dark/light をトグルし html クラスへ反映する', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(button);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('aria-pressed で状態を伝える', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed');
  });

  it('見えている文字を読み上げ名に含める', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');

    expect(button.getAttribute('aria-label')).toContain(button.textContent);
  });
});
