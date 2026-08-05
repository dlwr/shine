import type {Route} from './+types/daily';
import {resolveApiUrl} from '@/lib/api';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';

type DailyHistoryItem = {
  uid: string;
  title: string;
  year?: number;
  selectionDate: string;
};

export function meta({data}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = data as {locale?: Locale};

  return buildSocialMeta({
    title: '今日の1本 アーカイブ | SHINE',
    description:
      '映画賞や名作リストに選ばれた映画から毎日1本を紹介する「今日の1本」の過去のセレクション一覧。',
    path: '/daily',
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);

  const response = await fetch(
    `${resolveApiUrl(context)}/selections/daily/history?locale=${locale}&limit=30`,
    {signal: request.signal},
  );

  if (!response.ok) {
    throw new Response('Failed to load daily history', {status: 502});
  }

  const body = (await response.json()) as {items: DailyHistoryItem[]};
  return {items: body.items, locale};
}

export default function DailyArchive({loaderData}: Route.ComponentProps) {
  const {items, locale} = loaderData as {
    items: DailyHistoryItem[];
    locale: Locale;
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          DAILY PICKS
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-8">
          「今日の1本」の過去のセレクション
        </p>

        <div>
          {items.map(item => (
            <a
              key={`${item.selectionDate}-${item.uid}`}
              href={`/movies/${item.uid}`}
              className="flex items-baseline gap-3 py-3 border-t-2 border-ink no-underline text-ink">
              <span className="font-mono text-xs text-ink-muted shrink-0">
                {item.selectionDate}
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
