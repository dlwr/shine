import {Suspense} from 'react';
import {Await, data} from 'react-router';
import type {Route} from './+types/movies.$id';
import {ArticleLinksSection} from '@/components/editorial/article-links-section';
import {AwardTree} from '@/components/editorial/award-tree';
import {CreditsList} from '@/components/editorial/credits-list';
import {Masthead} from '@/components/editorial/masthead';
import {MovieDetailErrorView} from '@/components/editorial/movie-detail-error-view';
import {MovieHero} from '@/components/editorial/movie-hero';
import {MovieSynopsis} from '@/components/editorial/movie-synopsis';
import {MovieWatchSection} from '@/components/editorial/movie-watch-section';
import {RelatedMovies} from '@/components/editorial/related-movies';
import {SiteFooter} from '@/components/editorial/site-footer';
import {useArticleLinkForm, useIsTestMode} from '@/hooks/use-article-link-form';
import {submitArticleLink} from '@/lib/article-link-submission';
import {
  isLoaderError,
  isLoaderSuccess,
  loadMovieDetail,
  type LoaderData,
} from '@/lib/movie-detail';
import {buildMovieDetailMeta, isMonthlyPick} from '@/lib/movie-detail-meta';

export function meta({
  loaderData,
  matches,
  params,
}: Route.MetaArgs): Route.MetaDescriptors {
  return buildMovieDetailMeta({
    payload: loaderData as LoaderData | undefined,
    matches,
    movieId: params.id,
  });
}

export async function loader({context, params, request}: Route.LoaderArgs) {
  const result = await loadMovieDetail(context, params.id, request);
  if (isLoaderError(result)) {
    return data(result, {status: result.status ?? 500});
  }

  return result;
}

export async function action({context, params, request}: Route.ActionArgs) {
  return submitArticleLink(context, params.id, request);
}

export default function MovieDetail({
  loaderData,
  actionData,
  matches,
}: Route.ComponentProps) {
  const isTestMode = useIsTestMode();
  const loaded = loaderData as LoaderData;
  const apiUrl =
    ('apiUrl' in loaded ? loaded.apiUrl : undefined) ?? 'http://localhost:8787';
  const {
    formData,
    handleInputChange,
    handleCaptchaTokenChange,
    isLoadingTitle,
    submissionResult,
  } = useArticleLinkForm(isTestMode, actionData, apiUrl);

  if (isLoaderError(loaded)) {
    return (
      <MovieDetailErrorView
        error={loaded.error ?? '映画情報の取得に失敗しました'}
        status={loaded.status}
      />
    );
  }

  if (!isLoaderSuccess(loaded)) {
    return <MovieDetailErrorView error="映画情報が取得できませんでした" />;
  }

  const {movieDetail, turnstileSiteKey, locale} = loaded;
  const title = movieDetail.title || 'タイトル不明';
  const isThisMonthsPick = isMonthlyPick(matches, movieDetail.uid);

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <MovieHero
          movieDetail={movieDetail}
          title={title}
          isMonthlyPick={isThisMonthsPick}
          apiUrl={apiUrl}
        />

        <MovieWatchSection
          movieDetail={movieDetail}
          title={title}
          apiUrl={apiUrl}
          locale={locale}
        />

        {movieDetail.description && (
          <MovieSynopsis description={movieDetail.description} />
        )}

        {movieDetail.nominations && movieDetail.nominations.length > 0 && (
          <section className="mb-8">
            <p className="font-label text-xs text-ink-muted mb-3">
              受賞・ノミネート
            </p>
            <AwardTree nominations={movieDetail.nominations} />
          </section>
        )}

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

        {movieDetail.credits &&
          (movieDetail.credits.cast.length > 0 ||
            movieDetail.credits.crew.length > 0) && (
            <section className="mb-8">
              <p className="font-label text-xs text-ink-muted mb-3">
                監督・出演
              </p>
              <CreditsList credits={movieDetail.credits} />
            </section>
          )}

        {loaded.relatedMovies && (
          <Suspense>
            <Await resolve={loaded.relatedMovies}>
              {movies => <RelatedMovies movies={movies} />}
            </Await>
          </Suspense>
        )}

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
