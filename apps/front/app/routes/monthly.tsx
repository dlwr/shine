import type {Route} from './+types/monthly';
import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {CurrentMonthlyPick} from '@/components/selection-archive/current-monthly-pick';
import {canTransformImages, loadApiJson} from '@/lib/api';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {
  loadNextSelection,
  type SelectionHistoryItem,
} from '@/lib/selection-archive';

type MonthlyArchiveData = {
  items: SelectionHistoryItem[];
  next?: SelectionHistoryItem;
  locale: Locale;
  currentMonth: string;
  transformImages: boolean;
};

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = loaderData as Partial<MonthlyArchiveData>;
  return buildSocialMeta({
    title: '今月の1本 アーカイブ | SHINE',
    description:
      '映画賞や名作リストに選ばれた映画から毎月1本を紹介する「今月の1本」の過去のセレクション一覧。',
    path: '/monthly',
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({
  context,
  request,
}: Route.LoaderArgs): Promise<MonthlyArchiveData> {
  const locale = getLocaleFromRequest(request);

  const [body, next] = await Promise.all([
    loadApiJson<{items: SelectionHistoryItem[]}>(
      context,
      `/selections/monthly/history?locale=${locale}&limit=30`,
      {label: 'monthly history', signal: request.signal},
    ),
    loadNextSelection(locale, context, request),
  ]);

  return {
    items: body.items,
    next,
    locale,
    currentMonth: new Date().toISOString().slice(0, 7),
    transformImages: canTransformImages(context),
  };
}

function CalendarLinks() {
  const webcalUrl = `${SITE_URL.replace(/^https:/, 'webcal:')}/monthly.ics`;
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

export default function MonthlyArchive({loaderData}: Route.ComponentProps) {
  const {items, next, locale, currentMonth, transformImages} =
    loaderData as MonthlyArchiveData;
  const current = items.find(item =>
    item.selectionDate.startsWith(currentMonth),
  );
  const pastRows = items
    .filter(item => item !== current)
    .map(item => ({item, isNext: false}));
  const rows = next ? [{item: next, isNext: true}, ...pastRows] : pastRows;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-bold text-2xl md:text-3xl mb-2">
          これまでの今月の1本
        </h1>
        <p className="font-label text-xs text-ink-muted mb-4">
          「今月の1本」の過去のセレクション
        </p>
        <CalendarLinks />

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
              className={`flex gap-3 py-3 border-t-2 border-ink no-underline text-ink items-center${
                isNext ? ' border-dashed' : ''
              }`}>
              <PosterFrame
                posterUrl={item.posterUrl}
                alt={item.title}
                displaySize="w185"
                transformImages={transformImages}
                className="w-14 shrink-0"
              />
              <span className="font-label text-xs text-ink-muted shrink-0">
                {item.selectionDate.slice(0, 7)}
              </span>
              <span className="flex-1 min-w-0">
                {isNext && (
                  <span className="block font-label text-xs font-bold text-brand mb-1">
                    来月の1本 — 先に観ておくなら
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
