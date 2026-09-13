import {useCallback, useEffect, useState} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import type {Route} from './+types/home';
import {Button} from '@/components/ui/button';
import {AdminLogin} from '@/components/molecules/admin-login';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {adminFetch, getAdminToken} from '@/lib/admin-fetch';
import {DEFAULT_LOCALE, getLocaleFromRequest} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {FilmCard} from '@/components/editorial/film-card';
import {MonthlyPick} from '@/components/editorial/monthly-pick';
import {apiFetch, resolveApiUrl} from '@/lib/api';
import {
  buildSelectionPath,
  fetchHighlightedMovies,
  selectionRequestHeaders,
  type HighlightedMovies,
  type PeriodType,
} from '@/lib/home';
import {ManualSelectionPanel} from '@/components/admin/manual-selection-panel';

const SECONDARY_PERIODS: PeriodType[] = ['daily', 'weekly'];

type MoviesLabels = {
  randomMovie: string;
  daily: string;
  weekly: string;
  monthly: string;
  reselect: string;
  edit: string;
};

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
    };
  } catch (error) {
    console.error('SSR fetch error:', error);

    // フォールバック：エラー時はクライアントサイドで再試行
    return {
      movies: undefined,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      locale,
      apiUrl,
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
    shouldFetchOnClient,
  } = loaderData as {
    movies: HighlightedMovies | undefined;
    error: string | undefined;
    locale: string;
    apiUrl: string;
    shouldFetchOnClient?: boolean;
  };

  const [movies, setMovies] = useState<HighlightedMovies | undefined>(
    initialMovies,
  );
  const [error, setError] = useState<string | undefined>(initialError);
  const [loading, setLoading] = useState(shouldFetchOnClient);
  const [adminToken, setAdminToken] = useState<string | undefined>();

  useEffect(() => {
    if (globalThis.window === undefined) {
      return;
    }

    setAdminToken(getAdminToken());

    const handleAdminLogin = () => {
      setAdminToken(getAdminToken());
    };

    const handleAdminLogout = () => {
      setAdminToken(undefined);
    };

    addEventListener('adminLogin', handleAdminLogin);
    addEventListener('adminLogout', handleAdminLogout);

    return () => {
      removeEventListener('adminLogin', handleAdminLogin);
      removeEventListener('adminLogout', handleAdminLogout);
    };
  }, []);

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

  const labels = {
    en: {
      randomMovie: 'Random Movie',
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      reselect: 'Re-select',
      edit: 'Edit',
    },
    ja: {
      randomMovie: 'ランダム映画',
      daily: '日替わり',
      weekly: '週替わり',
      monthly: '月替わり',
      reselect: '再抽選',
      edit: '編集',
    },
  };

  const t = labels[locale as keyof typeof labels] || labels.en;

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
          adminToken={adminToken}
          labels={t}
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
  adminToken,
  labels,
  loading: isDataLoading,
  onMoviesChange,
  onError,
}: {
  movies: HighlightedMovies | undefined;
  error: string | undefined;
  locale: string;
  apiUrl: string;
  adminToken: string | undefined;
  labels: MoviesLabels;
  loading?: boolean;
  onMoviesChange: Dispatch<SetStateAction<HighlightedMovies | undefined>>;
  onError: Dispatch<SetStateAction<string | undefined>>;
}) {
  const [actionLoading, setActionLoading] = useState<
    Partial<Record<PeriodType, boolean>>
  >({});
  const [searchOpen, setSearchOpen] = useState<
    Partial<Record<PeriodType, boolean>>
  >({});

  const refreshHighlightedMovies = useCallback(async () => {
    onMoviesChange(await fetchHighlightedMovies(apiUrl, locale));
  }, [apiUrl, locale, onMoviesChange]);

  const handleReselect = useCallback(
    async (type: PeriodType) => {
      if (!adminToken) {
        alert(
          locale === 'ja'
            ? '管理者としてログインしてください'
            : 'Please login as admin',
        );
        return;
      }

      setActionLoading(previous => ({...previous, [type]: true}));

      try {
        const response = await adminFetch(`${apiUrl}/reselect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type,
            locale,
          }),
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        await refreshHighlightedMovies();
        onError(() => undefined); // eslint-disable-line unicorn/no-useless-undefined
      } catch (error_) {
        console.error('Error re-selecting movie:', error_);
        alert(
          locale === 'ja'
            ? 'エラーが発生しました。再度お試しください。'
            : 'An error occurred. Please try again.',
        );
        onError(
          locale === 'ja'
            ? '最新の映画情報を取得できませんでした。'
            : 'Failed to update selections.',
        );
      } finally {
        setActionLoading(previous => ({...previous, [type]: false}));
      }
    },
    [adminToken, apiUrl, locale, onError, refreshHighlightedMovies],
  );

  const handleOverrideSuccess = useCallback(
    async (type: PeriodType) => {
      try {
        await refreshHighlightedMovies();
        onError(() => '');
        setSearchOpen(previous => ({...previous, [type]: false}));
      } catch (error_) {
        console.error('Error refreshing movies after override:', error_);
        onError(
          locale === 'ja'
            ? '最新の映画情報を取得できませんでした。'
            : 'Failed to update selections.',
        );
      }
    },
    [locale, onError, refreshHighlightedMovies],
  );

  const handleOverrideLoadingChange = useCallback(
    (type: PeriodType, isLoading: boolean) => {
      setActionLoading(previous => ({...previous, [type]: isLoading}));
    },
    [],
  );

  const manualSetLabel = locale === 'ja' ? '検索して設定' : 'Search & Set';
  const closeSearchLabel = locale === 'ja' ? '検索を閉じる' : 'Close Search';
  const processingLabel = locale === 'ja' ? '処理中...' : 'Processing...';
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

    const movie = movies?.[period];
    // eslint-disable-next-line unicorn/no-computed-property-existence-check -- 存在ではなく値の真偽を見ている
    const isLoading = Boolean(actionLoading[period]);
    // eslint-disable-next-line unicorn/no-computed-property-existence-check -- 存在ではなく値の真偽を見ている
    const isSearchVisible = Boolean(searchOpen[period]);

    return (
      <div className="flex flex-col gap-2">
        {movie && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full border-2 border-ink font-mono text-xs">
            <a href={`/admin/movies/${movie.uid}`}>{labels.edit}</a>
          </Button>
        )}
        <Button
          className="w-full border-2 border-ink font-mono text-xs"
          size="sm"
          onClick={() => {
            void handleReselect(period);
          }}
          disabled={isLoading}>
          {isLoading ? (
            <div className="flex items-center justify-center">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-transparent mr-2" />
              {processingLabel}
            </div>
          ) : (
            labels.reselect
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full border-2 border-ink font-mono text-xs"
          onClick={() => {
            setSearchOpen(previous => ({
              ...previous,
              [period]: !isSearchVisible,
            }));
          }}
          disabled={isLoading}>
          {isSearchVisible ? closeSearchLabel : manualSetLabel}
        </Button>
        {isSearchVisible && (
          <div className="mt-2">
            <ManualSelectionPanel
              period={period}
              locale={locale}
              apiUrl={apiUrl}
              onClose={() => {
                setSearchOpen(previous => ({
                  ...previous,
                  [period]: false,
                }));
              }}
              onOverrideSuccess={() => handleOverrideSuccess(period)}
              onOverrideLoadingChange={value =>
                handleOverrideLoadingChange(period, value)
              }
              isParentLoading={isLoading}
            />
          </div>
        )}
      </div>
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
          <MonthlyPick movie={movies.monthly} locale={locale} />
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
