import type {Route} from './+types/years.$year';
import {BigYear} from '@/components/editorial/big-year';
import {AwardTags} from '@/components/editorial/award-tags';
import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {YearNavLink} from '@/components/editorial/year-nav-link';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {apiFetch} from '@/lib/api';

export type YearAwardData = {
  slug: string;
  shortLabel: string;
  name: string;
  organization: string;
};

export type YearMovieData = {
  uid: string;
  title?: string;
  posterUrl?: string;
  isWinner: boolean;
  awards: Array<{slug: string; isWinner: boolean}>;
};

export type YearDetailData = {
  year: number;
  movies: YearMovieData[];
  awards: YearAwardData[];
  previousYear?: number;
  nextYear?: number;
};

const STRUCTURED_DATA_ITEM_LIMIT = 100;
const DESCRIPTION_WINNER_LIMIT = 3;

function buildItemList(detail: YearDetailData): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${detail.year}年の映画`,
    itemListElement: detail.movies
      .slice(0, STRUCTURED_DATA_ITEM_LIMIT)
      .map((movie, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}/movies/${movie.uid}`,
        name: movie.title,
      })),
  };
}

function buildDescription(detail: YearDetailData): string {
  const winners = detail.movies.filter(movie => movie.isWinner && movie.title);
  const lead = `${detail.year}年に製作された映画${detail.movies.length}本の一覧。`;
  if (winners.length === 0) {
    return `${lead}映画賞・映画リストに選ばれた作品を横断して掲載。`;
  }

  const titles = winners
    .slice(0, DESCRIPTION_WINNER_LIMIT)
    .map(movie => `『${movie.title}』`)
    .join('');
  const suffix = winners.length > DESCRIPTION_WINNER_LIMIT ? 'ほか' : '';
  return `${lead}受賞作は${titles}${suffix}。映画賞・映画リストに選ばれた作品を横断して掲載。`;
}

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {detail, locale} = loaderData as {
    detail: YearDetailData;
    locale?: Locale;
  };

  return [
    ...buildSocialMeta({
      title: `${detail.year}年の映画 | なんか見る`,
      description: buildDescription(detail),
      path: `/years/${detail.year}`,
      locale: locale ?? DEFAULT_LOCALE,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    {'script:ld+json': buildItemList(detail)},
  ];
}

export async function loader({context, request, params}: Route.LoaderArgs) {
  if (!/^\d{4}$/.test(params.year ?? '')) {
    throw new Response('Not Found', {status: 404});
  }

  const locale = getLocaleFromRequest(request);

  const response = await apiFetch(context, `/years/${params.year}`, {
    signal: request.signal,
  });

  if (response.status === 404) {
    throw new Response('Not Found', {status: 404});
  }

  if (!response.ok) {
    throw new Response('Failed to load year', {status: 502});
  }

  const detail = (await response.json()) as YearDetailData;
  return {detail, locale};
}

function MovieRow({
  movie,
  awards,
}: {
  movie: YearMovieData;
  awards: YearAwardData[];
}) {
  const title = movie.title ?? 'Unknown Title';

  if (movie.isWinner) {
    return (
      <a
        href={`/movies/${movie.uid}`}
        className="flex items-center gap-4 py-3 no-underline text-ink">
        <PosterFrame
          posterUrl={movie.posterUrl}
          alt={`${title} poster`}
          className="w-16 shrink-0"
          displaySize="w185"
        />
        <span className="flex-1 flex flex-col gap-1.5">
          <span className="font-display font-extrabold text-base md:text-lg leading-tight">
            {title}
          </span>
          <AwardTags tags={movie.awards} legend={awards} />
        </span>
      </a>
    );
  }

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5 no-underline text-ink">
      <span className="font-mono text-sm leading-tight">{title}</span>
      <AwardTags tags={movie.awards} legend={awards} />
    </a>
  );
}

export default function YearPage({loaderData}: Route.ComponentProps) {
  const {detail} = loaderData as {detail: YearDetailData};
  const locale = 'ja';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <nav className="font-mono text-[10px] text-ink-muted mb-4">
          <a href="/years" className="text-ink-muted">
            YEARS
          </a>
        </nav>

        <h1 className="mb-2">
          <BigYear year={detail.year} className="text-6xl md:text-7xl" />
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-8">
          {detail.movies.length} FILMS
        </p>

        <div className="border-t-[3px] border-ink">
          {detail.movies.map(movie => (
            <MovieRow key={movie.uid} movie={movie} awards={detail.awards} />
          ))}
        </div>

        <div className="flex items-center justify-between border-t-2 border-ink mt-8 pt-3">
          <YearNavLink
            href={`/years/${detail.previousYear}`}
            year={detail.previousYear}
            label="PREV"
          />
          <a
            href="/years"
            className="font-mono text-[10px] text-ink-muted no-underline">
            ALL YEARS
          </a>
          <YearNavLink
            href={`/years/${detail.nextYear}`}
            year={detail.nextYear}
            label="NEXT"
          />
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
