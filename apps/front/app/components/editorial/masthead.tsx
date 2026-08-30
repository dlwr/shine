import {ThemeToggle} from './theme-toggle';
import {LanguageSelector} from '@/components/molecules/language-selector';

function today(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

const TAGLINES = {
  ja: ['毎日1本、埋もれた映画に', '光を当てる'],
  en: ['A FORGOTTEN FILM,', 'EVERY DAY'],
} as const;

const NAV_LINKS = [
  {href: '/quiz', label: 'QUIZ', ariaLabel: 'Quiz'},
  {href: '/watched', label: 'WATCHED', ariaLabel: 'Watched films'},
  {href: '/daily', label: 'DAILY', ariaLabel: 'Daily picks'},
  {href: '/awards', label: 'AWARDS', ariaLabel: 'Awards'},
  {href: '/people', label: 'PEOPLE', ariaLabel: 'People'},
  {href: '/years', label: 'YEARS', ariaLabel: 'Years'},
] as const;

export function Masthead({locale = 'en'}: {locale?: string}) {
  const [taglineTop, taglineBottom] =
    TAGLINES[locale as keyof typeof TAGLINES] ?? TAGLINES.en;

  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5 border-b-2 border-ink pb-2.5 mb-6">
      <h1 className="font-display font-black text-4xl md:text-5xl tracking-[-0.06em] leading-none">
        <a href="/" className="no-underline text-ink">
          SHINE
        </a>
      </h1>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2 md:gap-3">
        <p className="hidden md:block text-right font-mono text-[10px] leading-tight text-ink-muted">
          {taglineTop}
          <br />
          {taglineBottom} — {today()}
        </p>
        <LanguageSelector locale={locale} />
        {NAV_LINKS.map(link => (
          <a
            key={link.href}
            href={link.href}
            aria-label={link.ariaLabel}
            className="font-mono text-xs font-bold px-2.5 py-1 border-2 border-ink text-ink">
            {link.label}
          </a>
        ))}
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
