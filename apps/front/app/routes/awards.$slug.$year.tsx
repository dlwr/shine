import type {Route} from './+types/awards.$slug.$year';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {YearNavLink} from '@/components/editorial/year-nav-link';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {awardHeading} from '@/lib/awards';
import {MovieRow, type AwardMovieEntryData} from './awards.$slug';
import {apiFetch} from '@/lib/api';

export type AwardYearDetailData = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  year: number;
  ceremonyNumber?: number;
  movies: AwardMovieEntryData[];
  previousYear?: number;
  nextYear?: number;
};

function buildItemList(award: AwardYearDetailData): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${awardHeading(award)} ${award.year}`,
    itemListElement: award.movies.map((movie, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/movies/${movie.uid}`,
      name: movie.title,
    })),
  };
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {award, locale} = loaderData as {
    award: AwardYearDetailData;
    locale?: Locale;
  };
  const heading = awardHeading(award);
  const title = award.ceremonyNumber
    ? `${heading} ${award.year}年（第${award.ceremonyNumber}回） | SHINE`
    : `${heading} ${award.year}年 | SHINE`;
  const winner = award.movies.find(movie => movie.isWinner);
  const description = winner?.title
    ? `${award.year}年の${heading}。受賞は『${winner.title}』。ノミネート含む全${award.movies.length}作品の一覧。`
    : `${award.year}年の${heading}の受賞・ノミネート作品一覧。`;

  return [
    ...buildSocialMeta({
      title,
      description,
      path: `/awards/${award.slug}/${award.year}`,
      locale: locale ?? DEFAULT_LOCALE,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    {'script:ld+json': buildItemList(award)},
  ];
}

export async function loader({context, request, params}: Route.LoaderArgs) {
  if (!/^\d{4}$/.test(params.year ?? '')) {
    throw new Response('Not Found', {status: 404});
  }

  const locale = getLocaleFromRequest(request);

  const response = await apiFetch(
    context,
    `/awards/${params.slug}/${params.year}`,
    {signal: request.signal},
  );

  if (response.status === 404) {
    throw new Response('Not Found', {status: 404});
  }

  if (!response.ok) {
    throw new Response('Failed to load award year', {status: 502});
  }

  const award = (await response.json()) as AwardYearDetailData;
  return {award, locale};
}

export default function AwardYearPage({loaderData}: Route.ComponentProps) {
  const {award} = loaderData as {award: AwardYearDetailData};
  const locale = 'ja';
  const heading = awardHeading(award);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <nav className="font-mono text-[10px] text-ink-muted mb-4">
          <a href="/awards" className="text-ink-muted">
            AWARDS & LISTS
          </a>
          {' / '}
          <a href={`/awards/${award.slug}`} className="text-ink-muted">
            {heading}
          </a>
        </nav>

        <div className="flex items-baseline gap-3 mb-2">
          <h1 className="font-display font-black text-4xl md:text-5xl tracking-[-0.06em] leading-none">
            {award.year}
          </h1>
          {award.ceremonyNumber && (
            <span className="font-mono text-xs text-ink-muted">
              第{award.ceremonyNumber}回
            </span>
          )}
        </div>
        <p className="font-mono text-xs text-ink-muted mb-8">
          {heading} / {award.movies.length} FILMS
        </p>

        <div className="border-t-[3px] border-ink">
          {award.movies.map(movie => (
            <MovieRow key={movie.uid} movie={movie} />
          ))}
        </div>

        <div className="flex items-center justify-between border-t-2 border-ink mt-8 pt-3">
          <YearNavLink
            href={`/awards/${award.slug}/${award.previousYear}`}
            year={award.previousYear}
            label="PREV"
          />
          <a
            href={`/awards/${award.slug}`}
            className="font-mono text-[10px] text-ink-muted no-underline">
            ALL YEARS
          </a>
          <YearNavLink
            href={`/awards/${award.slug}/${award.nextYear}`}
            year={award.nextYear}
            label="NEXT"
          />
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
