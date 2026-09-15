import {useEffect, useState} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import type {Route} from './+types/home';
import {AdminLogin} from '@/components/molecules/admin-login';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {useAdminToken} from '@/hooks/use-admin-token';
import {DEFAULT_LOCALE, getLocaleFromRequest} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {FilmCard} from '@/components/editorial/film-card';
import {MonthlyPick} from '@/components/editorial/monthly-pick';
import {apiFetch, canTransformImages, resolveApiUrl} from '@/lib/api';
import {
  buildSelectionPath,
  fetchHighlightedMovies,
  selectionRequestHeaders,
  type HighlightedMovies,
  type PeriodType,
} from '@/lib/home';
import {SelectionAdminControls} from '@/components/admin/selection-admin-controls';

const SECONDARY_PERIODS: PeriodType[] = ['daily', 'weekly'];

const HOME_COPY = {
  ja: {
    title: 'SHINE — 毎月1本、みんなで同じ映画を観る',
    description:
      'カンヌ・アカデミー賞・日本アカデミー賞などの受賞作や名作リストから、毎日・毎週・毎月1本ずつ映画を選びます。いま配信やレンタルで観られるかも一緒に。',
  },
  en: {
    title: 'SHINE — A forgotten film, every day',
    description:
      'One overlooked film a day, a week, and a month — drawn from Cannes, the Academy Awards and curated lists, with where to watch it right now.',
  },
} as const;

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const locale = loaderData?.locale ?? DEFAULT_LOCALE;
  const copy = HOME_COPY[locale];

  return buildSocialMeta({
    title: copy.title,
    description: copy.description,
    path: '/',
    locale,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl = resolveApiUrl(context);
  const transformImages = canTransformImages(context);

  try {
    const response = await apiFetch(context, buildSelectionPath(locale), {
      headers: selectionRequestHeaders(locale),
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const movies = await response.json();
    return {
      movies,
      error: undefined,
      locale,
      apiUrl,
      transformImages,
    };
  } catch (error) {
    console.error('SSR fetch error:', error);

    // フォールバック：エラー時はクライアントサイドで再試行
    return {
      movies: undefined,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      locale,
      apiUrl,
      transformImages,
      shouldFetchOnClient: true,
    };
  }
}

export default function Home({loaderData}: Route.ComponentProps) {
  const {
    movies: initialMovies,
    error: initialError,
    locale,
    apiUrl,
    transformImages,
    shouldFetchOnClient,
  } = loaderData as {
    movies: HighlightedMovies | undefined;
    error: string | undefined;
    locale: string;
    apiUrl: string;
    transformImages?: boolean;
    shouldFetchOnClient?: boolean;
  };

  const [movies, setMovies] = useState<HighlightedMovies | undefined>(
    initialMovies,
  );
  const [error, setError] = useState<string | undefined>(initialError);
  const [loading, setLoading] = useState(shouldFetchOnClient);
  const adminToken = useAdminToken();

  // クライアントサイドでデータフェッチ
  useEffect(() => {
    if (!shouldFetchOnClient || globalThis.window === undefined) {
      return;
    }

    const fetchMovies = async () => {
      try {
        setLoading(true);
        setMovies(await fetchHighlightedMovies(apiUrl, locale));
        setError(undefined);
      } catch (error_) {
        console.error('Error fetching movies:', error_);
        setError(
          error_ instanceof Error ? error_.message : 'Unknown error occurred',
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchMovies();
  }, [shouldFetchOnClient, apiUrl, locale]);

  return (
    <div className="m-0 w-full h-full">
      <AdminLogin locale={locale} apiUrl={apiUrl} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Masthead locale={locale} />
        <Movies
          movies={movies}
          error={error}
          locale={locale}
          apiUrl={apiUrl}
          transformImages={transformImages}
          adminToken={adminToken}
          loading={loading}
          onMoviesChange={setMovies}
          onError={setError}
        />
        <SiteFooter locale={locale} />
      </main>
    </div>
  );
}

function Movies({
  movies,
  error,
  locale,
  apiUrl,
  transformImages,
  adminToken,
  loading: isDataLoading,
  onMoviesChange,
  onError,
}: {
  movies: HighlightedMovies | undefined;
  error: string | undefined;
  locale: string;
  apiUrl: string;
  transformImages?: boolean;
  adminToken: string | undefined;
  loading?: boolean;
  onMoviesChange: Dispatch<SetStateAction<HighlightedMovies | undefined>>;
  onError: Dispatch<SetStateAction<string | undefined>>;
}) {
  const noMovieLabel =
    locale === 'ja'
      ? '現在表示できる映画がありません。'
      : 'No movie selected yet.';

  const periodLabels: Record<PeriodType, string> = {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    monthly: 'MONTHLY',
  };

  const renderAdminControls = (period: PeriodType) => {
    if (!adminToken) {
      return;
    }

    return (
      <SelectionAdminControls
        period={period}
        movieUid={movies?.[period]?.uid}
        locale={locale}
        apiUrl={apiUrl}
        adminToken={adminToken}
        onMoviesChange={onMoviesChange}
        onError={onError}
      />
    );
  };

  return (
    <section className="py-4">
      {isDataLoading && (
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 text-ink/60">
            <div className="animate-spin h-5 w-5 border-2 border-ink/40 border-t-transparent rounded-full mr-3"></div>
            {locale === 'ja' ? 'データを読み込み中...' : 'Loading data...'}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 border-2 border-red-600 text-red-600 font-mono text-sm">
          {locale === 'ja'
            ? `APIから映画データを取得できませんでした。エラー: ${error}`
            : `Failed to fetch movie data from API. Error: ${error}`}
        </div>
      )}

      <div className="flex flex-col gap-2 anim-rise anim-rise-1">
        {movies?.monthly ? (
          <MonthlyPick
            movie={movies.monthly}
            locale={locale}
            transformImages={transformImages}
          />
        ) : (
          <p className="text-sm text-ink/50 font-mono">{noMovieLabel}</p>
        )}
        {renderAdminControls('monthly')}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {SECONDARY_PERIODS.map((period, index) => {
          const movie = movies?.[period];

          return (
            <div
              key={period}
              className={`flex flex-col gap-2 anim-rise anim-rise-${index + 2}`}>
              {movie ? (
                <FilmCard
                  movie={movie}
                  variant="compact"
                  locale={locale}
                  label={periodLabels[period]}
                  transformImages={transformImages}
                />
              ) : (
                <p className="text-sm text-ink/50 font-mono">{noMovieLabel}</p>
              )}
              {renderAdminControls(period)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
