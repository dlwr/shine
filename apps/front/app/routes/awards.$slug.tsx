import type {Route} from './+types/awards.$slug';
import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {awardHeading} from './awards';

export type AwardMovieEntryData = {
  uid: string;
  title?: string;
  movieYear?: number;
  posterUrl?: string;
  isWinner: boolean;
};

export type AwardYearGroupData = {
  year: number;
  ceremonyNumber?: number;
  movies: AwardMovieEntryData[];
};

export type AwardDetailData = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list';
  years: AwardYearGroupData[];
};

const STRUCTURED_DATA_ITEM_LIMIT = 100;

function yearRange(award: AwardDetailData): {first?: number; last?: number} {
  return {first: award.years.at(-1)?.year, last: award.years[0]?.year};
}

function countMovies(award: AwardDetailData): number {
  let count = 0;
  for (const group of award.years) {
    count += group.movies.length;
  }

  return count;
}

function buildItemList(award: AwardDetailData): Record<string, unknown> {
  const movies =
    award.grouping === 'year'
      ? award.years.flatMap(group =>
          group.movies.filter(movie => movie.isWinner),
        )
      : award.years.flatMap(group => group.movies);

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: awardHeading(award),
    itemListElement: movies
      .slice(0, STRUCTURED_DATA_ITEM_LIMIT)
      .map((movie, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}/movies/${movie.uid}`,
        name: movie.title,
      })),
  };
}

export function meta({data}: Route.MetaArgs): Route.MetaDescriptors {
  const {award, locale} = data as {award: AwardDetailData; locale?: Locale};
  const heading = awardHeading(award);
  const {first, last} = yearRange(award);

  const title =
    award.grouping === 'year'
      ? `${heading} 歴代一覧（${first}–${last}） | SHINE`
      : `${heading} 全${countMovies(award)}作品 | SHINE`;

  return [
    ...buildSocialMeta({
      title,
      description: award.description,
      path: `/awards/${award.slug}`,
      locale: locale ?? DEFAULT_LOCALE,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    {'script:ld+json': buildItemList(award)},
  ];
}

export async function loader({context, request, params}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl =
    (context.cloudflare as {env?: {PUBLIC_API_URL?: string}}).env
      ?.PUBLIC_API_URL || 'http://localhost:8787';

  const response = await fetch(`${apiUrl}/awards/${params.slug}`, {
    signal: request.signal,
  });

  if (response.status === 404) {
    throw new Response('Not Found', {status: 404});
  }

  if (!response.ok) {
    throw new Response('Failed to load award', {status: 502});
  }

  const award = (await response.json()) as AwardDetailData;
  return {award, locale};
}

export function MovieRow({movie}: {movie: AwardMovieEntryData}) {
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
        />
        <span className="flex-1 font-display font-extrabold text-base md:text-lg leading-tight">
          {title}
        </span>
        <span className="font-mono text-[9px] bg-brand text-brand-on px-1.5 py-0.5 shrink-0">
          WINNER
        </span>
      </a>
    );
  }

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex items-center gap-4 py-1.5 no-underline text-ink">
      <span className="flex-1 font-mono text-sm leading-tight">{title}</span>
    </a>
  );
}

function ListRow({movie}: {movie: AwardMovieEntryData}) {
  const title = movie.title ?? 'Unknown Title';

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex items-center gap-3 py-2 border-t-2 border-ink no-underline text-ink">
      <PosterFrame
        posterUrl={movie.posterUrl}
        alt={`${title} poster`}
        className="w-9 shrink-0"
      />
      <span className="flex-1 font-display font-extrabold text-sm leading-none">
        {title}
      </span>
      {movie.movieYear && (
        <span className="font-mono text-xs text-ink-muted shrink-0">
          {movie.movieYear}
        </span>
      )}
    </a>
  );
}

export default function AwardDetailPage({loaderData}: Route.ComponentProps) {
  const {award} = loaderData as {award: AwardDetailData};
  const locale = 'ja';
  const heading = awardHeading(award);
  const {first, last} = yearRange(award);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <nav className="font-mono text-[10px] text-ink-muted mb-4">
          <a href="/awards" className="text-ink-muted">
            AWARDS & LISTS
          </a>
        </nav>

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          {heading}
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-8">
          {award.grouping === 'year' && first !== last
            ? `${first}–${last} / ${countMovies(award)} FILMS`
            : `${countMovies(award)} FILMS`}
        </p>

        {award.grouping === 'year' ? (
          <div className="space-y-10">
            {award.years.map(group => (
              <section key={group.year}>
                <div className="flex items-baseline gap-3 border-t-[3px] border-ink pt-2 mb-2">
                  <h2 className="font-display font-black text-3xl md:text-4xl tracking-[-0.06em] leading-none">
                    <a
                      href={`/awards/${award.slug}/${group.year}`}
                      className="text-ink no-underline">
                      {group.year}
                    </a>
                  </h2>
                  {group.ceremonyNumber && (
                    <span className="font-mono text-[10px] text-ink-muted">
                      第{group.ceremonyNumber}回
                    </span>
                  )}
                </div>
                <div>
                  {group.movies.map(movie => (
                    <MovieRow key={movie.uid} movie={movie} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div>
            {award.years.flatMap(group =>
              group.movies.map(movie => (
                <ListRow key={movie.uid} movie={movie} />
              )),
            )}
          </div>
        )}

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
