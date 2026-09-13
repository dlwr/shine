import {redirect} from 'react-router';
import type {Route} from './+types/movies.$id';
import {
  apiFetch,
  resolveApiUrl,
  resolveEnvironment,
  type LoadContext,
} from '@/lib/api';
import {
  ArticleLinksSection,
  type ArticleLink,
} from '@/components/editorial/article-links-section';
import {AwardTree} from '@/components/editorial/award-tree';
import {WatchedToggle} from '@/components/editorial/watched-toggle';
import {
  CreditsList,
  type MovieCredits,
} from '@/components/editorial/credits-list';
import {Masthead} from '@/components/editorial/masthead';
import {BigYear} from '@/components/editorial/big-year';
import {MetaLine} from '@/components/editorial/meta-line';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {AvailabilityBadges} from '@/components/editorial/availability-badges';
import {WatchMenu} from '@/components/editorial/watch-menu';
import {SiteFooter} from '@/components/editorial/site-footer';
import {useArticleLinkForm, useIsTestMode} from '@/hooks/use-article-link-form';
import {useOnDemandAvailability} from '@/hooks/use-on-demand-availability';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';

type MovieDetailData = {
  uid: string;
  year: number;
  originalLanguage: string;
  imdbId: string;
  tmdbId: number;
  imdbUrl?: string;
  posterUrl?: string;
  title: string;
  description?: string;
  nominations: Array<{
    uid: string;
    isWinner: boolean;
    specialMention?: string;
    person?: {uid: string; name: string};
    category: {
      uid: string;
      name: string;
      displayName?: string;
    };
    ceremony: {
      uid: string;
      number?: number;
      year: number;
    };
    organization: {
      uid: string;
      name: string;
      shortName?: string;
      displayName?: string;
    };
  }>;
  articleLinks: ArticleLink[];
  availability?: Array<{
    source: string;
    detail?: string;
    checkedAt: number;
  }>;
  credits?: MovieCredits;
};
type LoaderErrorResponse = {
  error: string;
  status?: number;
  locale: Locale;
};

type RelatedMovie = {
  uid: string;
  title: string;
  year?: number;
  posterUrl?: string;
};

type LoaderSuccessResponse = {
  movieDetail: MovieDetailData;
  relatedMovies?: RelatedMovie[];
  turnstileSiteKey?: string;
  locale: Locale;
  apiUrl?: string;
};

type LoaderData = LoaderErrorResponse | LoaderSuccessResponse;

function isLoaderError(data: LoaderData): data is LoaderErrorResponse {
  return 'error' in data;
}

function isLoaderSuccess(data: LoaderData): data is LoaderSuccessResponse {
  return 'movieDetail' in data;
}

function MovieDetailErrorView({
  error,
  status,
}: {
  error: string;
  status?: number;
}) {
  const title =
    status === 404 ? '映画が見つかりません' : 'エラーが発生しました';

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="max-w-md w-full bg-surface border-2 border-ink p-6">
        <h1 className="text-xl font-bold text-brand mb-4">{title}</h1>
        <p className="text-ink mb-6">{error}</p>
        <a
          href="/"
          className="inline-block border-2 border-ink px-4 py-2 font-mono text-sm shadow-[2px_2px_0_var(--ink)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all">
          ← SHINE
        </a>
      </div>
    </div>
  );
}

const MAX_DESCRIPTION_ORGANIZATIONS = 3;

function summarizeOrganizations(
  nominations: MovieDetailData['nominations'],
): string {
  const names = [
    ...new Set(
      nominations.map(
        nomination =>
          nomination.organization.displayName ||
          nomination.organization.shortName ||
          nomination.organization.name,
      ),
    ),
  ];

  return names.slice(0, MAX_DESCRIPTION_ORGANIZATIONS).join('・');
}

const MAX_META_DESCRIPTION_LENGTH = 120;

function buildMetaDescription(
  headline: string,
  synopsis: string | undefined,
): string {
  const room = MAX_META_DESCRIPTION_LENGTH - [...headline].length;

  if (!synopsis || room <= 0) {
    return `${headline}いま配信・レンタルで観られるかをまとめています。`;
  }

  const characters = [...synopsis];

  return characters.length > room
    ? `${headline}${characters.slice(0, room - 1).join('')}…`
    : `${headline}${synopsis}`;
}

function buildMovieJsonLd(
  movieDetail: MovieDetailData,
): Record<string, unknown> {
  const awards = movieDetail.nominations
    .filter(nomination => nomination.isWinner)
    .map(nomination => {
      const organization =
        nomination.organization.displayName ?? nomination.organization.name;
      const category =
        nomination.category.displayName ?? nomination.category.name;

      return `${organization} ${category} (${nomination.ceremony.year})`;
    });

  return {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: movieDetail.title,
    url: `${SITE_URL}/movies/${movieDetail.uid}`,
    ...(movieDetail.posterUrl && {image: movieDetail.posterUrl}),
    ...(movieDetail.description && {description: movieDetail.description}),
    ...(movieDetail.year && {datePublished: String(movieDetail.year)}),
    ...(movieDetail.imdbUrl && {sameAs: movieDetail.imdbUrl}),
    ...(awards.length > 0 && {award: awards}),
  };
}

export function meta({
  loaderData,
  params,
}: Route.MetaArgs): Route.MetaDescriptors {
  const payload = loaderData as LoaderData | undefined;
  const locale = payload?.locale ?? DEFAULT_LOCALE;
  const path = `/movies/${params.id}`;

  if (payload && isLoaderError(payload) && payload.error) {
    return buildSocialMeta({
      title: '映画が見つかりません | SHINE',
      description: '指定された映画は見つかりませんでした。',
      path,
      locale,
    });
  }

  const movieDetail =
    payload && isLoaderSuccess(payload) ? payload.movieDetail : undefined;
  const title = movieDetail?.title || '映画詳細';
  const year = movieDetail?.year || '';
  const organizations = movieDetail
    ? summarizeOrganizations(movieDetail.nominations)
    : '';
  const selection = organizations ? `${organizations}に選出。` : '';

  return [
    ...buildSocialMeta({
      title: `${title} (${year}) | SHINE`,
      description: buildMetaDescription(
        `『${title}』(${year}年)。${selection}`,
        movieDetail?.description,
      ),
      path,
      locale,
      type: 'article',
      imageUrl: `${SITE_URL}/og/movie.png?id=${params.id}`,
      largeImage: true,
    }),
    ...(movieDetail ? [{'script:ld+json': buildMovieJsonLd(movieDetail)}] : []),
  ];
}

async function fetchRelatedMovies(
  context: LoadContext,
  movieId: string,
  locale: Locale,
  signal?: AbortSignal,
): Promise<RelatedMovie[]> {
  try {
    const response = await apiFetch(
      context,
      `/movies/${movieId}/related?locale=${locale}&limit=6`,
      {signal},
    );

    if (!response?.ok) {
      return [];
    }

    const body = (await response.json()) as {movies?: RelatedMovie[]};
    return body.movies ?? [];
  } catch {
    return [];
  }
}

export async function loader({
  context,
  params,
  request,
}: Route.LoaderArgs): Promise<LoaderData> {
  const locale = getLocaleFromRequest(request);

  try {
    const environment = resolveEnvironment(context);
    const apiUrl = resolveApiUrl(context);
    const [response, relatedMovies] = await Promise.all([
      apiFetch(context, `/movies/${params.id}`, {
        signal: request.signal, // React Router v7推奨：abortシグナル
      }),
      fetchRelatedMovies(context, params.id, locale, request.signal),
    ]);

    if (response.status === 404) {
      return {
        error: '映画が見つかりませんでした',
        status: 404,
        locale,
      };
    }

    if (!response.ok) {
      return {
        error: 'データの取得に失敗しました',
        status: response.status,
        locale,
      };
    }

    const movieDetail = (await response.json()) as MovieDetailData;
    const turnstileSiteKey = environment.PUBLIC_TURNSTILE_SITE_KEY;
    return {movieDetail, relatedMovies, turnstileSiteKey, locale, apiUrl};
  } catch {
    return {
      error: 'APIへの接続に失敗しました',
      status: 500,
      locale,
    };
  }
}

export async function action({context, params, request}: Route.ActionArgs) {
  try {
    const formData = await request.formData();

    const url = formData.get('url') as string;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const captchaToken = formData.get('captchaToken');

    if (!captchaToken || typeof captchaToken !== 'string' || !captchaToken) {
      return {
        success: false,
        error: '認証に失敗しました。少し待ってから再度お試しください。',
      };
    }

    const response = await apiFetch(
      context,
      `/movies/${params.id}/article-links`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          title,
          description,
          captchaToken,
        }),
        signal: request.signal,
      },
    );

    if (response.ok) {
      return redirect(`/movies/${params.id}#article-links`, {status: 303});
    }

    let errorMessage = '投稿に失敗しました。';

    try {
      const errorData = (await response.json()) as {error?: string};
      errorMessage = errorData.error || errorMessage;
    } catch {
      // JSON でない場合はデフォルトメッセージをそのまま使う
    }

    return {
      success: false,
      error: errorMessage,
    };
  } catch {
    return {
      success: false,
      error: '投稿処理中にエラーが発生しました。',
    };
  }
}

export default function MovieDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const isTestMode = useIsTestMode();
  const data = loaderData as LoaderData;
  const apiUrl =
    ('apiUrl' in data ? data.apiUrl : undefined) ?? 'http://localhost:8787';
  const {
    formData,
    handleInputChange,
    handleCaptchaTokenChange,
    isLoadingTitle,
    submissionResult,
  } = useArticleLinkForm(isTestMode, actionData, apiUrl);

  const successData = isLoaderSuccess(data) ? data : undefined;
  const {availability, checking: availabilityChecking} =
    useOnDemandAvailability({
      movieUid: successData?.movieDetail.uid ?? '',
      apiUrl,
      initial: successData?.movieDetail.availability,
    });

  if (isLoaderError(data)) {
    return (
      <MovieDetailErrorView
        error={data.error ?? '映画情報の取得に失敗しました'}
        status={data.status}
      />
    );
  }

  if (!isLoaderSuccess(data)) {
    return <MovieDetailErrorView error="映画情報が取得できませんでした" />;
  }

  const {movieDetail, turnstileSiteKey, locale} = data;
  const relatedMovies = data.relatedMovies ?? [];
  const title = movieDetail.title || 'タイトル不明';

  const metaItems: string[] = [];
  if (movieDetail.imdbId) {
    metaItems.push(`IMDb ${movieDetail.imdbId}`);
  }

  if (movieDetail.originalLanguage) {
    metaItems.push(movieDetail.originalLanguage.toUpperCase());
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        {/* Hero */}
        <div className="flex gap-5 mb-8 pb-8 border-b-2 border-ink">
          <PosterFrame
            posterUrl={movieDetail.posterUrl}
            alt={`${title} poster`}
            className="w-28 md:w-36 shrink-0"
            priority
            displaySize="w342"
          />
          <div className="flex flex-col justify-end gap-2">
            {movieDetail.year && (
              <a
                href={`/years/${movieDetail.year}`}
                className="no-underline text-ink">
                <BigYear
                  year={movieDetail.year}
                  className="text-6xl md:text-7xl"
                />
              </a>
            )}
            <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight">
              {title}
            </h1>
            <MetaLine items={metaItems} />
            <WatchedToggle uid={movieDetail.uid} />
          </div>
        </div>

        {/* Synopsis */}
        {movieDetail.description && (
          <section className="mb-8">
            <p className="font-mono text-xs text-ink-muted mb-3">あらすじ</p>
            <p className="text-sm leading-relaxed text-ink">
              {movieDetail.description}
            </p>
          </section>
        )}

        {/* Cast & Crew */}
        {movieDetail.credits &&
          (movieDetail.credits.cast.length > 0 ||
            movieDetail.credits.crew.length > 0) && (
            <section className="mb-8">
              <p className="font-mono text-xs text-ink-muted mb-3">
                CAST &amp; CREW
              </p>
              <CreditsList credits={movieDetail.credits} />
            </section>
          )}

        {/* Awards */}
        {movieDetail.nominations && movieDetail.nominations.length > 0 && (
          <section className="mb-8">
            <p className="font-mono text-xs text-ink-muted mb-3">AWARDS</p>
            <AwardTree nominations={movieDetail.nominations} />
          </section>
        )}

        {/* Watch */}
        <section className="mb-8">
          <p className="font-mono text-xs text-ink-muted mb-3">WATCH</p>
          {availabilityChecking ? (
            <p className="font-mono text-xs text-ink-muted mb-3">
              配信状況を確認中…
            </p>
          ) : (
            <AvailabilityBadges availability={availability} className="mb-3" />
          )}
          <WatchMenu
            title={title}
            year={movieDetail.year}
            tmdbId={movieDetail.tmdbId}
            imdbUrl={movieDetail.imdbUrl}
            locale={locale}
          />
        </section>

        {/* Article Links */}
        <ArticleLinksSection
          articleLinks={movieDetail.articleLinks}
          movieUid={movieDetail.uid}
          movieTitle={movieDetail.title}
          isTestMode={isTestMode}
          formData={formData}
          handleInputChange={handleInputChange}
          handleCaptchaTokenChange={handleCaptchaTokenChange}
          isLoadingTitle={isLoadingTitle}
          submissionResult={submissionResult}
          turnstileSiteKey={turnstileSiteKey}
        />

        {/* Related Movies */}
        {relatedMovies.length > 0 && (
          <section className="mb-8">
            <p className="font-mono text-xs text-ink-muted mb-3">関連映画</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {relatedMovies.map(relatedMovie => (
                <a
                  key={relatedMovie.uid}
                  href={`/movies/${relatedMovie.uid}`}
                  className="no-underline text-ink">
                  <PosterFrame
                    posterUrl={relatedMovie.posterUrl}
                    alt={`${relatedMovie.title} poster`}
                    className="w-full"
                    displaySize="w342"
                  />
                  <span className="block font-display font-bold text-xs leading-tight mt-1.5">
                    {relatedMovie.title}
                  </span>
                  {relatedMovie.year && (
                    <span className="block font-mono text-[10px] text-ink-muted mt-0.5">
                      {relatedMovie.year}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
