import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {CurrentMonthlyPick} from '@/components/selection-archive/current-monthly-pick';
import {SITE_URL} from '@/lib/meta';
import type {
  SelectionArchiveConfig,
  SelectionArchiveData,
} from '@/lib/selection-archive';

const ARCHIVE_LINKS = [
  {label: 'DAILY', path: '/daily'},
  {label: 'WEEKLY', path: '/weekly'},
  {label: 'MONTHLY', path: '/monthly'},
] as const;
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
