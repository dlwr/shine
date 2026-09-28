import {useEffect, useState} from 'react';
import {applyTheme, type Theme} from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

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

  const label = theme === 'dark' ? 'Dark' : 'Light';

  return (
    <button
      type="button"
      aria-label={`${label} — テーマを切り替える`}
      aria-pressed={theme === 'dark'}
      onClick={toggle}
      className="font-label text-sm text-ink-muted underline">
      {label}
    </button>
  );
}
