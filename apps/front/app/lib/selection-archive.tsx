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
import {TAGLINE} from '@/lib/tagline';

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
    <p className="flex flex-wrap gap-x-4 gap-y-1 font-label text-xs mb-4">
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
  isNext: boolean,
): string | undefined {
  return isNext && config.type === 'monthly'
    ? '来月の1本 — 先に観ておくなら'
    : undefined;
}

const CURRENT_MONTHLY_LABEL = '今月みんなで観ている1本';

function CurrentMonthlyPick({
  item,
  transformImages,
}: {
  item: SelectionHistoryItem;
  transformImages: boolean;
}) {
  const movieHref = `/movies/${item.uid}`;

  return (
    <section
      aria-labelledby="current-monthly-pick"
      className="flex gap-4 mb-8 pb-6 border-b-[4px] border-double border-rule">
      <a
        href={movieHref}
        aria-hidden="true"
        tabIndex={-1}
        className="block w-24 md:w-32 shrink-0 no-underline">
        <PosterFrame
          posterUrl={item.posterUrl}
          alt={item.title}
          displaySize="w185"
          transformImages={transformImages}
          className="w-full"
        />
      </a>
      <div className="flex min-w-0 flex-col gap-2">
        <h2
          id="current-monthly-pick"
          className="font-display text-sm font-bold text-brand">
          {CURRENT_MONTHLY_LABEL}
        </h2>
        <a
          href={movieHref}
          className="font-display font-bold text-xl md:text-2xl leading-tight text-ink no-underline">
          『{item.title}』{item.year ? `(${item.year})` : ''}
        </a>
        <p className="font-display text-sm text-ink-muted">{TAGLINE}</p>
        {(item.articleLinkCount ?? 0) > 0 && (
          <p className="font-label text-xs text-ink-muted">
            みんなの投稿 {item.articleLinkCount} 件
          </p>
        )}
        <p className="mt-1">
          <a
            href={`${movieHref}#article-links`}
            className="inline-block border border-ink bg-ink px-4 py-2 font-label text-sm font-bold text-paper no-underline">
            観たら感想・ポストのリンクを貼る
          </a>
        </p>
      </div>
    </section>
  );
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
  const current =
    config.type === 'monthly'
      ? items.find(item => item.selectionDate.startsWith(currentMonth))
      : undefined;
  const pastRows = items
    .filter(item => item !== current)
    .map(item => ({item, isNext: false}));
  const rows = next ? [{item: next, isNext: true}, ...pastRows] : pastRows;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-bold text-2xl md:text-3xl mb-2">
          {config.heading}
        </h1>
        <p className="font-label text-xs text-ink-muted mb-4">
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
                className="font-label text-xs font-bold px-2.5 py-1 border border-ink bg-brand text-brand-on">
                {link.label}
              </span>
            ) : (
              <a
                key={link.path}
                href={link.path}
                className="font-label text-xs font-bold px-2.5 py-1 border border-ink text-ink no-underline">
                {link.label}
              </a>
            ),
          )}
        </nav>

        {current && (
          <CurrentMonthlyPick
            item={current}
            transformImages={transformImages}
          />
        )}

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
              <span className="font-label text-xs text-ink-muted shrink-0">
                {formatDate(item.selectionDate)}
              </span>
              <span className="flex-1 min-w-0">
                {rowLabel(config, isNext) && (
                  <span className="block font-label text-xs font-bold text-brand mb-1">
                    {rowLabel(config, isNext)}
                  </span>
                )}
                <span className="block font-display font-extrabold text-base md:text-lg leading-tight">
                  『{item.title}』{item.year ? `(${item.year})` : ''}
                </span>
                {(item.articleLinkCount ?? 0) > 0 && (
                  <span className="block font-label text-xs text-ink-muted mt-1">
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
