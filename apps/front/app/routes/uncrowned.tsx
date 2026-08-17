import type {Route} from './+types/uncrowned';
import {Masthead} from '@/components/editorial/masthead';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {SiteFooter} from '@/components/editorial/site-footer';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';

type UncrownedAward = {
  slug: string;
  name: string;
  shortLabel: string;
  organization: string;
};

type UncrownedLoss = {
  slug: string;
  year: number;
};

type UncrownedMovie = {
  uid: string;
  title?: string;
  year?: number;
  posterUrl?: string;
  losses: UncrownedLoss[];
};

type UncrownedData = {
  nominatedFilmCount: number;
  uncrownedFilmCount: number;
  awards: UncrownedAward[];
  topMovies: UncrownedMovie[];
};

export function meta({data}: Route.MetaArgs): Route.MetaDescriptors {
  const {locale} = data as {locale?: Locale};

  return buildSocialMeta({
    title: '無冠の映画 | SHINE',
    description:
      'ノミネートはされた。しかし一度も勝てなかった。SHINEが記録する映画賞で最も多く敗れた、無冠の映画たちの一覧。',
    path: '/uncrowned',
    locale: locale ?? DEFAULT_LOCALE,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl =
    (context.cloudflare as {env?: {PUBLIC_API_URL?: string}}).env
      ?.PUBLIC_API_URL || 'http://localhost:8787';

  const response = await fetch(`${apiUrl}/uncrowned`, {signal: request.signal});
  if (!response.ok) {
    throw new Response('Failed to load uncrowned', {status: 502});
  }

  const body = (await response.json()) as UncrownedData;
  return {...body, locale};
}

function LossTags({
  losses,
  awards,
}: {
  losses: UncrownedLoss[];
  awards: UncrownedAward[];
}) {
  const labels = new Map(awards.map(award => [award.slug, award.shortLabel]));

  return (
    <div className="flex flex-wrap gap-1">
      {losses.map(loss => (
        <span
          key={`${loss.slug}:${loss.year}`}
          className="border border-ink-muted px-1 py-0.5 font-mono text-[10px] text-ink-muted">
          {labels.get(loss.slug) ?? loss.slug} {loss.year}
        </span>
      ))}
    </div>
  );
}

export default function Uncrowned({loaderData}: Route.ComponentProps) {
  const {nominatedFilmCount, uncrownedFilmCount, awards, topMovies} =
    loaderData as UncrownedData;
  const locale = 'ja';
  const [leader, ...rest] = topMovies;
  const uncrownedShare =
    nominatedFilmCount > 0
      ? ((uncrownedFilmCount / nominatedFilmCount) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-2">
          UNCROWNED
        </h1>
        <p className="font-mono text-xs text-ink-muted mb-8">
          一度も勝てなかった映画たち
        </p>

        <section className="mb-10 border-t-2 border-b-2 border-ink py-4">
          <p className="font-display text-sm md:text-base leading-relaxed">
            SHINEは映画賞を記録してきた。つまり、勝者を数えてきた。
            <br />
            だがノミネートされた
            {nominatedFilmCount.toLocaleString('en-US')}本のうち
            <span className="font-black text-brand">
              {uncrownedFilmCount.toLocaleString('en-US')}本
            </span>
            ——
            <span className="font-black">{uncrownedShare}%</span>
            ——は、一度も勝っていない。
            <br />
            ここは、その敗者たちの頁。
          </p>
        </section>

        {leader && (
          <section className="mb-10 border-2 border-ink p-4 shadow-[6px_6px_0_var(--brand)]">
            <p className="font-mono text-xs text-ink-muted mb-3">
              最も多く敗れた映画
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
                  <span>{leader.losses.length}</span>
                  <span className="text-2xl">敗</span>
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
                <LossTags losses={leader.losses} awards={awards} />
              </div>
            </div>
          </section>
        )}

        <section className="mb-10">
          <p className="font-mono text-xs text-ink-muted mb-3">
            敗北を重ねた映画
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
                      {movie.losses.length}敗
                    </span>
                    <span className="font-display font-bold text-xs leading-tight">
                      {movie.title ?? 'タイトル不明'}
                    </span>
                  </span>
                </a>
                <span className="mt-1 block font-mono text-[10px] text-ink-muted">
                  {movie.year}
                </span>
                <div className="mt-1">
                  <LossTags losses={movie.losses} awards={awards} />
                </div>
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
            href="/crossings"
            className="inline-block font-mono text-xs font-bold border-2 border-ink px-3 py-1.5 shadow-[3px_3px_0_var(--ink)] no-underline text-ink">
            賞の交差
          </a>
        </div>

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
