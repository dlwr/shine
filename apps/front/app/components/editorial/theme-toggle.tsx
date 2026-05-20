import {useEffect, useState} from 'react';
import {applyTheme, type Theme} from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    );
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      aria-pressed={theme === 'dark'}
      onClick={toggle}
      className="font-mono text-xs border-2 border-ink px-2 py-1 text-ink">
      {theme === 'dark' ? '☾ DARK' : '☀ LIGHT'}
    </button>
  );
}
