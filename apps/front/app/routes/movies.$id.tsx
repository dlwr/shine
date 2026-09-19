import {redirect} from 'react-router';
import type {Route} from './+types/movies.$id';
import {apiFetch, resolveApiUrl, resolveEnvironment} from '@/lib/api';
import {ArticleLinksSection} from '@/components/editorial/article-links-section';
import {AwardTree} from '@/components/editorial/award-tree';
import {WatchedToggle} from '@/components/editorial/watched-toggle';
import {CreditsList} from '@/components/editorial/credits-list';
import {Masthead} from '@/components/editorial/masthead';
import {BigYear} from '@/components/editorial/big-year';
import {MetaLine} from '@/components/editorial/meta-line';
import {MovieDetailErrorView} from '@/components/editorial/movie-detail-error-view';
import {PosterFrame} from '@/components/editorial/poster-frame';
import {RelatedMovies} from '@/components/editorial/related-movies';
import {AvailabilityBadges} from '@/components/editorial/availability-badges';
import {WatchMenu} from '@/components/editorial/watch-menu';
import {SiteFooter} from '@/components/editorial/site-footer';
import {useArticleLinkForm, useIsTestMode} from '@/hooks/use-article-link-form';
import {useOnDemandAvailability} from '@/hooks/use-on-demand-availability';
import {DEFAULT_LOCALE, getLocaleFromRequest} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {
  fetchRelatedMovies,
  isLoaderError,
  isLoaderSuccess,
  type LoaderData,
  type MovieDetailData,
} from '@/lib/movie-detail';
import {
  buildMetaDescription,
  buildMovieJsonLd,
  isMonthlyPick,
  summarizeOrganizations,
} from '@/lib/movie-detail-meta';
import {monthlyPickLabel} from '@/lib/monthly-pick';

export function meta({
  loaderData,
  matches,
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
  const monthlyLabel = isMonthlyPick(matches, params.id)
    ? monthlyPickLabel(new Date(), locale)
    : undefined;
  const pageTitle = monthlyLabel
    ? `${title} (${year}) — ${monthlyLabel} | SHINE`
    : `${title} (${year}) | SHINE`;

  return [
    ...buildSocialMeta({
      title: pageTitle,
      description: buildMetaDescription(
        `『${title}』(${year}年)。${monthlyLabel ? `${monthlyLabel}。` : ''}${selection}`,
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

    const adminToken = formData.get('adminToken');
    const response = await apiFetch(
      context,
      `/movies/${params.id}/article-links`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(typeof adminToken === 'string' &&
            adminToken && {Authorization: `Bearer ${adminToken}`}),
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
  matches,
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
  const isThisMonthsPick = isMonthlyPick(matches, movieDetail.uid);

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
            <WatchedToggle
              uid={movieDetail.uid}
              isMonthlyPick={isThisMonthsPick}
            />
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
          isMonthlyPick={isThisMonthsPick}
        />

        {/* Related Movies */}
        <RelatedMovies movies={relatedMovies} />

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
