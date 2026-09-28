export type Theme = 'light' | 'dark';
export const THEME_KEY = 'shine-theme';

export function resolveTheme(): Theme {
  if (globalThis.localStorage) {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  }

  return 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(THEME_KEY, theme);
}

export const NO_FLASH_SCRIPT = `(function(){try{var k='${THEME_KEY}';var s=localStorage.getItem(k);var d=s!=='light';document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
