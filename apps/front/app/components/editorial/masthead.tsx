import {useState} from 'react';
import {ThemeToggle} from './theme-toggle';
import {LanguageSelector} from '@/components/molecules/language-selector';

const TAGLINES = {
  ja: '毎月1本、みんなで同じ映画を観る',
  en: 'One film a month, watched together',
} as const;

const NAV_LINKS = [
  {href: '/quiz', ja: 'クイズ', en: 'Quiz', ariaLabel: 'Quiz'},
  {href: '/watched', ja: '観た映画', en: 'Watched', ariaLabel: 'Watched films'},
  {href: '/daily', ja: '日替わり', en: 'Daily', ariaLabel: 'Daily picks'},
  {href: '/awards', ja: '映画賞', en: 'Awards', ariaLabel: 'Awards'},
  {href: '/people', ja: '人物', en: 'People', ariaLabel: 'People'},
  {href: '/years', ja: '年代', en: 'Years', ariaLabel: 'Years'},
] as const;

const CONTROLS = {
  ja: {search: '検索', menu: 'メニュー'},
  en: {search: 'Search', menu: 'Menu'},
} as const;

export function Masthead({
  locale = 'en',
  showTagline = true,
}: {
  locale?: string;
  showTagline?: boolean;
}) {
  const lang = locale === 'ja' ? 'ja' : 'en';
  const controls = CONTROLS[lang];
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="relative mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-[4px] border-double border-rule pb-3">
      <div className="flex items-baseline gap-4">
        <h1 className="font-display text-3xl leading-none font-bold tracking-[0.2em] md:text-4xl">
          <a href="/" className="text-ink no-underline">
            SHINE
          </a>
        </h1>
        {showTagline && (
          <p className="hidden font-display text-sm text-ink-muted md:block">
            {TAGLINES[lang]}
          </p>
        )}
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <nav
          id="site-nav"
          aria-label="Site"
          className={`${menuOpen ? 'flex' : 'hidden'} absolute inset-x-0 top-full z-20 flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule bg-paper px-1 py-4 md:contents`}>
          {NAV_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              aria-label={link.ariaLabel}
              className="font-label text-sm text-ink no-underline hover:underline">
              {link[lang]}
            </a>
          ))}
          <LanguageSelector locale={locale} />
          <div className="md:order-last">
            <ThemeToggle />
          </div>
        </nav>
        <a
          href="/search"
          aria-label="Search"
          className="border border-ink px-3 py-1 font-label text-sm text-ink no-underline">
          {controls.search}
        </a>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => {
            setMenuOpen(open => !open);
          }}
          className="border border-ink px-3 py-1 font-label text-sm text-ink md:hidden">
          {controls.menu}
        </button>
      </div>
    </header>
  );
}
