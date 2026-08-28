import type {Route} from './+types/crossings';
import {CrossingMatrix} from '@/components/editorial/crossing-matrix';
import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {resolveApiUrl} from '@/lib/api';

type CrossingsAward = {
  slug: string;
  name: string;
  shortLabel: string;
  organization: string;
  filmCount: number;
};

type CrossingsMovie = {
  uid: string;
  title?: string;
  year?: number;
  posterUrl?: string;
  awardSlugs: string[];
};

type CrossingsData = {
  awards: CrossingsAward[];
  pairs: Array<{a: string; b: string; shared: number}>;
  distribution: Array<{awardCount: number; filmCount: number}>;
  topMovies: CrossingsMovie[];
};

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = loaderData as {locale?: Locale};

  return buildSocialMeta({
    title: '賞の交差 | SHINE',
    description:
      '13の映画賞・映画リストが同じ映画をどれだけ選んでいるか。最も多くの賞に選ばれた作品と、賞同士の重なりの一覧。',
    path: '/crossings',
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl = resolveApiUrl(context);

  const response = await fetch(`${apiUrl}/crossings`, {signal: request.signal});
  if (!response.ok) {
    throw new Response('Failed to load crossings', {status: 502});
  }

  const body = (await response.json()) as CrossingsData;
  return {...body, locale};
}

function AwardTags({
  slugs,
  awards,
}: {
  slugs: string[];
  awards: CrossingsAward[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {awards
        .filter(award => slugs.includes(award.slug))
        .map(award => (
          <span
            key={award.slug}
            className="border border-ink-muted px-1 py-0.5 font-mono text-[10px] text-ink-muted">
            {award.shortLabel}
          </span>
        ))}
    </div>
  );
}

export default function Crossings({loaderData}: Route.ComponentProps) {
  const {awards, pairs, distribution, topMovies} = loaderData as CrossingsData;
  const locale = 'ja';
  const [leader, ...rest] = topMovies;
  const maxFilmCount = Math.max(
    ...distribution.map(entry => entry.filmCount),
    1,
  );

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          CROSSINGS
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-8">
          {awards.length}の映画賞・映画リストが、同じ映画をどれだけ選んでいるか
        </p>

        {leader && (
          <section className="mb-10 border-2 border-ink p-4 shadow-[6px_6px_0_var(--brand)]">
            <p className="font-mono text-xs text-ink-muted mb-3">
              最も多くの賞に選ばれた映画
            </p>
            <div className="flex gap-4">
              <a href={`/movies/${leader.uid}`} className="shrink-0">
                <PosterFrame
                  posterUrl={leader.posterUrl}
                  alt={`${leader.title ?? ''} poster`}
                  className="w-24 md:w-32"
                  priority
                  displaySize="w342"
                />
              </a>
              <div className="flex flex-col justify-center gap-2">
                <p className="font-display font-black text-5xl leading-none text-brand">
                  {leader.awardSlugs.length}
                </p>
                <h2 className="font-display font-black text-xl md:text-2xl leading-tight">
                  <a href={`/movies/${leader.uid}`} className="text-ink">
                    {leader.title ?? 'タイトル不明'}
                  </a>
                </h2>
                {leader.year && (
                  <p className="font-mono text-xs text-ink-muted">
                    {leader.year}
                  </p>
                )}
                <AwardTags slugs={leader.awardSlugs} awards={awards} />
              </div>
            </div>
          </section>
        )}

        <section className="mb-10">
          <p className="font-mono text-xs text-ink-muted mb-3">
            いくつの賞に選ばれたか
          </p>
          <ul>
            {distribution.map(entry => (
              <li
                key={entry.awardCount}
                className="flex items-center gap-3 border-t border-ink/20 py-1.5">
                <span className="w-16 shrink-0 font-mono text-xs text-ink-muted">
                  {entry.awardCount}賞
                </span>
                <span
                  className="h-3 bg-ink"
                  style={{
                    width: `${Math.max(
                      2,
                      (Math.log10(entry.filmCount + 1) /
                        Math.log10(maxFilmCount + 1)) *
                        100,
                    )}%`,
                  }}
                />
                <span className="font-mono text-xs">
                  {entry.filmCount.toLocaleString('en-US')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <p className="font-mono text-xs text-ink-muted mb-3">
            賞と賞の重なり（両方に選ばれた本数）
          </p>
          <CrossingMatrix
            awards={awards.map(award => ({
              key: award.slug,
              shortLabel: award.shortLabel,
              name: award.name,
              count: award.filmCount,
              href: `/awards/${award.slug}`,
            }))}
            pairs={pairs}
          />
        </section>

        <section className="mb-10">
          <p className="font-mono text-xs text-ink-muted mb-3">
            多くの賞に選ばれた映画
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {rest.map(movie => (
              <div key={movie.uid}>
                <a
                  href={`/movies/${movie.uid}`}
                  className="no-underline text-ink">
                  <PosterFrame
                    posterUrl={movie.posterUrl}
                    alt={`${movie.title ?? ''} poster`}
                    className="w-full"
                    displaySize="w342"
                  />
                  <span className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="font-display font-black text-sm text-brand">
                      {movie.awardSlugs.length}
                    </span>
                    <span className="font-display font-bold text-xs leading-tight">
                      {movie.title ?? 'タイトル不明'}
                    </span>
                  </span>
                </a>
                <span className="mt-1 block font-mono text-[10px] text-ink-muted">
                  {movie.year}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <a
            href="/awards"
            className="inline-block font-mono text-xs font-bold border-2 border-ink px-3 py-1.5 shadow-[3px_3px_0_var(--ink)] no-underline text-ink">
            映画賞・リスト一覧
          </a>
          <a
            href="/people/crossings"
            className="inline-block font-mono text-xs font-bold border-2 border-ink px-3 py-1.5 shadow-[3px_3px_0_var(--ink)] no-underline text-ink">
            映画人の交差
          </a>
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
