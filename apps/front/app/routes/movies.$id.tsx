import type {Route} from './+types/movies.$id';
import {ArticleLinksSection} from '@/components/editorial/article-links-section';
import {AwardTree} from '@/components/editorial/award-tree';
import {CreditsList} from '@/components/editorial/credits-list';
import {Masthead} from '@/components/editorial/masthead';
import {MovieDetailErrorView} from '@/components/editorial/movie-detail-error-view';
import {MovieHero} from '@/components/editorial/movie-hero';
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

export async function loader({
  context,
  params,
  request,
}: Route.LoaderArgs): Promise<LoaderData> {
  return loadMovieDetail(context, params.id, request);
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

        <MovieWatchSection
          movieDetail={movieDetail}
          title={title}
          apiUrl={apiUrl}
          locale={locale}
        />

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
