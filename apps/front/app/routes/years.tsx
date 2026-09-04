import type {Route} from './+types/years';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {apiFetch} from '@/lib/api';

export type YearSummaryData = {
  year: number;
  movieCount: number;
  winnerCount: number;
};

type Decade = {
  start: number;
  years: YearSummaryData[];
};

function groupByDecade(years: YearSummaryData[]): Decade[] {
  const byStart = new Map<number, YearSummaryData[]>();
  for (const entry of years) {
    const start = Math.floor(entry.year / 10) * 10;
    const group = byStart.get(start) ?? [];
    group.push(entry);
    byStart.set(start, group);
  }

  return [...byStart]
    .map(([start, group]) => ({
      start,
      years: group.toSorted((a, b) => b.year - a.year),
    }))
    .toSorted((a, b) => b.start - a.start);
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {years, locale} = loaderData as {
    years: YearSummaryData[];
    locale?: Locale;
  };
  const sorted = years.map(entry => entry.year).toSorted((a, b) => a - b);
  const range =
    sorted.length > 0 ? `${sorted[0]}年から${sorted.at(-1)}年まで、` : '';

  return buildSocialMeta({
    title: '製作年から探す映画一覧 | なんか見る',
    description: `${range}製作年ごとに映画賞・映画リストに選ばれた映画を一覧。`,
    path: '/years',
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);

  const response = await apiFetch(context, `/years`, {signal: request.signal});
  if (!response.ok) {
    throw new Response('Failed to load years', {status: 502});
  }

  const body = (await response.json()) as {years: YearSummaryData[]};
  return {years: body.years, locale};
}

export default function YearsIndex({loaderData}: Route.ComponentProps) {
  const {years} = loaderData as {years: YearSummaryData[]};
  const locale = 'ja';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          YEARS
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-8">
          製作年から映画賞・映画リストに選ばれた作品を探す
        </p>

        {groupByDecade(years).map(decade => (
          <section key={decade.start} className="border-t-2 border-ink py-4">
            <h2 className="font-display font-extrabold text-lg leading-tight mb-3">
              {decade.start}s
            </h2>
            <div className="flex flex-wrap gap-2">
              {decade.years.map(entry => (
                <a
                  key={entry.year}
                  href={`/years/${entry.year}`}
                  className="flex items-baseline gap-1.5 border-2 border-ink px-2.5 py-1 font-mono text-xs font-bold no-underline text-ink">
                  {entry.year}
                  <span className="text-[10px] font-normal text-ink-muted">
                    {entry.movieCount}
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
