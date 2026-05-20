import {ThemeToggle} from './theme-toggle';
import {LanguageSelector} from '@/components/molecules/language-selector';

export function Masthead({locale = 'en'}: {locale?: string}) {
  return (
    <header className="flex items-end justify-between border-b-2 border-ink pb-2.5 mb-6">
      <h1 className="font-display font-black text-4xl md:text-5xl tracking-[-0.06em] leading-none text-ink">
        SHINE
      </h1>
      <div className="flex items-center gap-2">
        <LanguageSelector locale={locale} />
        <a
          href="/search"
          aria-label="Search"
          className="font-mono text-xs font-bold bg-brand text-brand-on px-2.5 py-1 border-2 border-ink shadow-[3px_3px_0_var(--ink)]">
          SEARCH
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
