import {
  canTransformImages,
  loadApiJson,
  tryApiJson,
  type LoadContext,
} from '@/lib/api';
import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import type {SelectionPreviewData} from '@/lib/api-types';

type SelectionHistoryItem = {
  uid: string;
  title: string;
  year?: number;
  selectionDate: string;
  posterUrl?: string;
  articleLinkCount?: number;
};

export type SelectionArchiveData = {
  items: SelectionHistoryItem[];
  next?: SelectionHistoryItem;
  locale: Locale;
  currentMonth: string;
  transformImages: boolean;
};

export type SelectionArchiveConfig = {
  type: 'daily' | 'weekly' | 'monthly';
  path: string;
  heading: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  formatDate?: (selectionDate: string) => string;
  showPosters?: boolean;
  calendarPath?: string;
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

export async function loadNextSelection(
  type: SelectionArchiveConfig['type'],
  locale: Locale,
  context: LoadContext,
  request: Request,
): Promise<SelectionHistoryItem | undefined> {
  const preview = await tryApiJson<SelectionPreviewData>(
    context,
    `/selections/${type}/next?locale=${locale}`,
    {signal: request.signal},
  );
  if (!preview) {
    return undefined;
  }

  const {date, movie} = preview;
  return {
    uid: movie.uid,
    title: movie.title,
    year: movie.year,
    selectionDate: date,
    posterUrl: movie.posterUrl,
  };
}

export async function loadSelectionArchive(
  config: SelectionArchiveConfig,
  context: LoadContext,
  request: Request,
): Promise<SelectionArchiveData> {
  const locale = getLocaleFromRequest(request);

  const [body, next] = await Promise.all([
    loadApiJson<{items: SelectionHistoryItem[]}>(
      context,
      `/selections/${config.type}/history?locale=${locale}&limit=30`,
      {label: `${config.type} history`, signal: request.signal},
    ),
    config.type === 'monthly'
      ? loadNextSelection(config.type, locale, context, request)
      : undefined,
  ]);

  return {
    items: body.items,
    next,
    locale,
    currentMonth: new Date().toISOString().slice(0, 7),
    transformImages: canTransformImages(context),
  };
}

function CalendarLinks({calendarPath}: {calendarPath: string}) {
  const webcalUrl = `${SITE_URL.replace(/^https:/, 'webcal:')}${calendarPath}`;
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs mb-4">
      <a href={webcalUrl} className="text-ink underline">
        カレンダーに登録
      </a>
      <a href={googleUrl} className="text-ink underline">
        Google カレンダー
      </a>
    </p>
  );
}

function rowLabel(
  config: SelectionArchiveConfig,
  item: SelectionHistoryItem,
  currentMonth: string,
  isNext: boolean,
): string | undefined {
  if (config.type !== 'monthly') {
    return undefined;
  }

  if (isNext) {
    return '来月の1本 — 先に観ておくなら';
  }

  return item.selectionDate.startsWith(currentMonth)
    ? '今月みんなで観ている1本'
    : undefined;
}

export function SelectionArchivePage({
  config,
  items,
  next,
  locale,
  currentMonth,
  transformImages,
}: {
  config: SelectionArchiveConfig;
} & SelectionArchiveData) {
  const formatDate = config.formatDate ?? ((date: string) => date);
  const rows = next
    ? [
        {item: next, isNext: true},
        ...items.map(item => ({item, isNext: false})),
      ]
    : items.map(item => ({item, isNext: false}));

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
        {config.calendarPath && (
          <CalendarLinks calendarPath={config.calendarPath} />
        )}

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
          {rows.map(({item, isNext}) => (
            <a
              key={`${item.selectionDate}-${item.uid}`}
              href={`/movies/${item.uid}`}
              className={`flex gap-3 py-3 border-t-2 border-ink no-underline text-ink ${
                config.showPosters ? 'items-center' : 'items-baseline'
              }${isNext ? ' border-dashed' : ''}`}>
              {config.showPosters && (
                <PosterFrame
                  posterUrl={item.posterUrl}
                  alt={item.title}
                  displaySize="w185"
                  transformImages={transformImages}
                  className="w-14 shrink-0"
                />
              )}
              <span className="font-mono text-xs text-ink-muted shrink-0">
                {formatDate(item.selectionDate)}
              </span>
              <span className="flex-1 min-w-0">
                {rowLabel(config, item, currentMonth, isNext) && (
                  <span className="block font-mono text-xs font-bold text-brand mb-1">
                    {rowLabel(config, item, currentMonth, isNext)}
                  </span>
                )}
                <span className="block font-display font-extrabold text-base md:text-lg leading-tight">
                  『{item.title}』{item.year ? `(${item.year})` : ''}
                </span>
                {(item.articleLinkCount ?? 0) > 0 && (
                  <span className="block font-mono text-xs text-ink-muted mt-1">
                    みんなの投稿 {item.articleLinkCount} 件
                  </span>
                )}
              </span>
            </a>
          ))}
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
