import {resolveApiUrl} from '@/lib/api';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';

export type SelectionHistoryItem = {
  uid: string;
  title: string;
  year?: number;
  selectionDate: string;
};

export type SelectionArchiveData = {
  items: SelectionHistoryItem[];
  locale: Locale;
};

export type SelectionArchiveConfig = {
  type: 'daily' | 'weekly' | 'monthly';
  path: string;
  heading: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  formatDate?: (selectionDate: string) => string;
};

const ARCHIVE_LINKS = [
  {label: 'DAILY', path: '/daily'},
  {label: 'WEEKLY', path: '/weekly'},
  {label: 'MONTHLY', path: '/monthly'},
] as const;

export function buildArchiveMeta(
  config: SelectionArchiveConfig,
  locale: Locale | undefined,
) {
  return buildSocialMeta({
    title: config.metaTitle,
    description: config.metaDescription,
    path: config.path,
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loadSelectionArchive(
  config: SelectionArchiveConfig,
  context: unknown,
  request: Request,
): Promise<SelectionArchiveData> {
  const locale = getLocaleFromRequest(request);

  const response = await fetch(
    `${resolveApiUrl(context)}/selections/${config.type}/history?locale=${locale}&limit=30`,
    {signal: request.signal},
  );

  if (!response.ok) {
    throw new Response(`Failed to load ${config.type} history`, {status: 502});
  }

  const body = (await response.json()) as {items: SelectionHistoryItem[]};
  return {items: body.items, locale};
}

export function SelectionArchivePage({
  config,
  items,
  locale,
}: {
  config: SelectionArchiveConfig;
  items: SelectionHistoryItem[];
  locale: Locale;
}) {
  const formatDate = config.formatDate ?? ((date: string) => date);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          {config.heading}
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-4">
          {config.subtitle}
        </p>

        <nav className="flex gap-2 mb-8">
          {ARCHIVE_LINKS.map(link =>
            link.path === config.path ? (
              <span
                key={link.path}
                className="font-mono text-xs font-bold px-2.5 py-1 border-2 border-ink bg-brand text-brand-on">
                {link.label}
              </span>
            ) : (
              <a
                key={link.path}
                href={link.path}
                className="font-mono text-xs font-bold px-2.5 py-1 border-2 border-ink text-ink no-underline">
                {link.label}
              </a>
            ),
          )}
        </nav>

        <div>
          {items.map(item => (
            <a
              key={`${item.selectionDate}-${item.uid}`}
              href={`/movies/${item.uid}`}
              className="flex items-baseline gap-3 py-3 border-t-2 border-ink no-underline text-ink">
              <span className="font-mono text-xs text-ink-muted shrink-0">
                {formatDate(item.selectionDate)}
              </span>
              <span className="flex-1 font-display font-extrabold text-base md:text-lg leading-tight">
                『{item.title}』{item.year ? `(${item.year})` : ''}
              </span>
            </a>
          ))}
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
