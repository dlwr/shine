import {useCallback, useEffect, useState} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import type {Route} from './+types/home';
import {Button} from '@/components/ui/button';
import {MovieCard} from '@/components/molecules/movie-card';
import type {MovieCardMovie} from '@/components/molecules/movie-card';
import {AdminLogin} from '@/components/molecules/admin-login';
import {LanguageSelector} from '@/components/molecules/language-selector';

type HighlightedMovies = {
  daily?: MovieCardMovie;
  weekly?: MovieCardMovie;
  monthly?: MovieCardMovie;
};

type PeriodType = keyof HighlightedMovies;

const SELECTION_PERIODS: PeriodType[] = ['daily', 'weekly', 'monthly'];

type SearchMovie = {
	uid: string;
	title?: string;
	year?: number;
	translations?: Array<{
		languageCode: string;
		content: string;
		isDefault: number;
	}>;
};

function createSelectionCacheKey() {
	const now = new Date();

	if (now.getHours() < 6) {
		now.setDate(now.getDate() - 1);
	}

	const year = now.getFullYear();
	const month = now.getMonth() + 1;
	const day = now.getDate();

	return `${year}-${month}-${day}`;
}

function getLocalizedMovieTitle(movie: SearchMovie, locale: string) {
	if (movie.title && movie.title.trim().length > 0) {
		return movie.title;
	}

	if (!movie.translations || movie.translations.length === 0) {
		return locale === 'ja' ? 'タイトル不明' : 'Untitled';
	}

	const translationForLocale = movie.translations.find(
		translation => translation.languageCode === locale,
	);

	if (translationForLocale?.content) {
		return translationForLocale.content;
	}

	const defaultTranslation = movie.translations.find(
		translation => translation.isDefault === 1,
	);

	if (defaultTranslation?.content) {
		return defaultTranslation.content;
	}

	return (
		movie.translations[0]?.content || (locale === 'ja' ? 'タイトル不明' : 'Untitled')
	);
}

type MoviesLabels = {
  randomMovie: string;
  daily: string;
  weekly: string;
  monthly: string;
  reselect: string;
};

export function meta(): Route.MetaDescriptors {
  return [
    {title: 'SHINE'},
    {
      name: 'description',
      content: "The world's most organized movie database",
    },
  ];
}

function getLocaleFromRequest(request: Request): string {
  const url = new URL(request.url);
  const localeParameter = url.searchParams.get('locale');
  if (localeParameter && ['en', 'ja'].includes(localeParameter)) {
    return localeParameter;
  }

  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    const languages = acceptLanguage
      .split(',')
      .map(lang => lang.trim().split(';')[0].split('-')[0])
      .filter(lang => ['en', 'ja'].includes(lang));

    if (languages.length > 0) {
      return languages[0];
    }
  }

  return 'en';
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const apiUrl =
    (context.cloudflare as {env: {PUBLIC_API_URL?: string}}).env
      .PUBLIC_API_URL || 'http://localhost:8787';

  try {
    // Cloudflare Workers環境ではfetchが利用可能
    // React Router v7公式パターン：loaderでfetchを直接使用
    const cacheKey = createSelectionCacheKey();
    const fetchUrl = `${apiUrl}/?cache=${cacheKey}&locale=${locale}`;

    // React Router v7推奨：loaderでfetchを直接使用
    const response = await fetch(fetchUrl, {
      headers: {
        'Cache-Control': 'no-store',
        'Accept-Language': locale === 'ja' ? 'ja,en;q=0.5' : 'en',
        // Request signal for abort handling
      },
      signal: request.signal, // React Router v7推奨：abortシグナル
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
    if (globalThis.window !== undefined) {
      setAdminToken(localStorage.getItem('adminToken') || undefined);

      const handleAdminLogin = () => {
        setAdminToken(localStorage.getItem('adminToken') || undefined);
      };

      const handleAdminLogout = () => {
        setAdminToken(undefined);
      };

      globalThis.addEventListener('adminLogin', handleAdminLogin);
      globalThis.addEventListener('adminLogout', handleAdminLogout);

      return () => {
        globalThis.removeEventListener('adminLogin', handleAdminLogin);
        globalThis.removeEventListener('adminLogout', handleAdminLogout);
      };
    }
  }, []);

  // クライアントサイドでデータフェッチ
  useEffect(() => {
    if (shouldFetchOnClient && globalThis.window !== undefined) {
      const fetchMovies = async () => {
        try {
          setLoading(true);

          const cacheKey = createSelectionCacheKey();
          const fetchUrl = `${apiUrl}/?cache=${cacheKey}&locale=${locale}`;

          const response = await fetch(fetchUrl, {
            headers: {
              'Cache-Control': 'no-store',
              'Accept-Language': locale === 'ja' ? 'ja,en;q=0.5' : 'en',
            },
          });

          if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
          }

          const fetchedMovies = (await response.json()) as HighlightedMovies;
          setMovies(fetchedMovies);
          setError(undefined);
        } catch (error_) {
          console.error('Error fetching movies:', error_);
          setError(
            error_ instanceof Error ? error_.message : 'Unknown error occurred',
          );
          setMovies({
            daily: {uid: '1', title: 'The Shawshank Redemption', year: 1994},
            weekly: {uid: '1', title: 'The Shawshank Redemption', year: 1994},
            monthly: {
              uid: '1',
              title: 'The Shawshank Redemption',
              year: 1994,
            },
          });
        } finally {
          setLoading(false);
        }
      };

      void fetchMovies();
    }
  }, [shouldFetchOnClient, apiUrl, locale]);

  const labels = {
    en: {
      randomMovie: 'Random Movie',
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      reselect: 'Re-select',
    },
    ja: {
      randomMovie: 'ランダム映画',
      daily: '日替わり',
      weekly: '週替わり',
      monthly: '月替わり',
      reselect: '再抽選',
    },
  };

  const t = labels[locale as keyof typeof labels] || labels.en;

  return (
    <div className="m-0 w-full h-full bg-gray-50">
      <AdminLogin locale={locale} apiUrl={apiUrl} />
      <main className="py-8">
        <h1 className="text-center mb-4 text-5xl text-gray-900 font-bold">
          SHINE
        </h1>
        <LanguageSelector locale={locale} />
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
      </main>
    </div>
  );
}

function ManualSelectionPanel({
	period,
	locale,
	apiUrl,
	adminToken,
	onClose,
	onOverrideSuccess,
	onOverrideLoadingChange,
	isParentLoading,
}: {
	period: PeriodType;
	locale: string;
	apiUrl: string;
	adminToken: string;
	onClose: () => void;
	onOverrideSuccess: () => Promise<void> | void;
	onOverrideLoadingChange: (value: boolean) => void;
	isParentLoading: boolean;
}) {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<SearchMovie[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [overrideLoading, setOverrideLoading] = useState(false);
	const [message, setMessage] = useState<string | undefined>();
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		if (!query.trim()) {
			setResults([]);
			setSearchLoading(false);
			return;
		}

		let cancelled = false;
		setSearchLoading(true);
		setError(undefined);

		const timeoutId = setTimeout(async () => {
			try {
				const response = await fetch(
					`${apiUrl}/admin/movies?search=${encodeURIComponent(query)}&limit=20`,
					{headers: {Authorization: `Bearer ${adminToken}`}},
				);

				if (!response.ok) {
					throw new Error(`Search failed: ${response.status}`);
				}

				const data = (await response.json()) as {movies: SearchMovie[]};

				if (!cancelled) {
					setResults(data.movies ?? []);
				}
			} catch (error_) {
				if (cancelled) {
					return;
				}

				console.error('Search error:', error_);
				setError(locale === 'ja' ? '検索に失敗しました。' : 'Search failed.');
				setResults([]);
			} finally {
				if (!cancelled) {
					setSearchLoading(false);
				}
			}
		}, 300);

		return () => {
			cancelled = true;
			clearTimeout(timeoutId);
		};
	}, [query, apiUrl, adminToken, locale]);

	const processingLabel = locale === 'ja' ? '処理中...' : 'Processing...';
	const searchPlaceholder =
		locale === 'ja' ? '作品名や年で検索' : 'Search by title or year';
	const hintText =
		locale === 'ja'
			? 'キーワードを入力すると自動で検索します。'
			: 'Type a keyword and results will appear automatically.';
	const resultsEmptyText =
		locale === 'ja' ? '検索結果がありません。' : 'No movies found.';
	const closeLabel = locale === 'ja' ? '閉じる' : 'Close';
	const setMovieLabel =
		locale === 'ja' ? 'この映画を設定' : 'Set this movie';
	const searchLabel =
		locale === 'ja' ? '映画を検索して設定' : 'Search and set a movie';

	const isBusy = overrideLoading || isParentLoading;

	const handleOverride = async (movie: SearchMovie) => {
		if (isBusy) {
			return;
		}

		setOverrideLoading(true);
		onOverrideLoadingChange(true);
		setMessage(undefined);
		setError(undefined);

		try {
			const response = await fetch(`${apiUrl}/admin/override-selection`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${adminToken}`,
				},
				body: JSON.stringify({
					type: period,
					date: new Date().toISOString().split('T')[0],
					movieId: movie.uid,
				}),
			});

			if (!response.ok) {
				let serverMessage: string | undefined;
				try {
					const payload = (await response.json()) as {error?: string};
					serverMessage = payload.error;
				} catch (parseError) {
					console.debug('Failed to parse override error payload', parseError);
				}
				throw new Error(serverMessage ?? `Request failed: ${response.status}`);
			}

			await onOverrideSuccess();
			setMessage(locale === 'ja' ? '選択を更新しました。' : 'Selection updated.');
			setQuery('');
			setResults([]);
		} catch (error_) {
			console.error('Override error:', error_);
			setError(
				locale === 'ja'
					? '更新に失敗しました。もう一度お試しください。'
					: 'Failed to update selection. Please try again.',
			);
		} finally {
			setOverrideLoading(false);
			onOverrideLoadingChange(false);
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-medium text-gray-800">{searchLabel}</p>
				<button
					type="button"
					onClick={onClose}
					className="text-xs font-medium text-gray-500 hover:text-gray-700"
				>
					{closeLabel}
				</button>
			</div>

			<div className="flex flex-col gap-2">
				<input
					type="text"
					value={query}
					onChange={event => setQuery(event.target.value)}
					placeholder={searchPlaceholder}
					className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
					disabled={isParentLoading}
				/>
				<p className="text-xs text-gray-500">{hintText}</p>
			</div>

			{searchLoading && (
				<p className="text-sm text-gray-500">
					{locale === 'ja' ? '検索中...' : 'Searching...'}
				</p>
			)}

			{!searchLoading && query.trim().length > 0 && results.length === 0 && !error && (
				<p className="text-sm text-gray-500">{resultsEmptyText}</p>
			)}

			<ul className="space-y-2">
				{results.map(movie => {
					const title = getLocalizedMovieTitle(movie, locale);
					return (
						<li
							key={movie.uid}
							className="flex flex-col gap-2 border-b border-gray-200 pb-3 last:border-0"
						>
							<div className="text-left">
								<p className="text-sm font-medium text-gray-900">{title}</p>
								{movie.year !== undefined && (
									<p className="text-xs text-gray-500">
										{locale === 'ja' ? `公開年: ${movie.year}` : `Year: ${movie.year}`}
									</p>
								)}
							</div>
							<div>
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										void handleOverride(movie);
									}}
									disabled={isBusy}
								>
									{isBusy ? processingLabel : setMovieLabel}
								</Button>
							</div>
						</li>
					);
				})}
			</ul>

			{message && (
				<p className="text-sm text-green-600">
					{message}
				</p>
			)}

			{error && (
				<p className="text-sm text-red-600">
					{error}
				</p>
			)}
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
		const cacheKey = createSelectionCacheKey();
		const response = await fetch(`${apiUrl}/?cache=${cacheKey}&locale=${locale}`, {
			headers: {
				'Cache-Control': 'no-store',
				'Accept-Language': locale === 'ja' ? 'ja,en;q=0.5' : 'en',
			},
		});

		if (!response.ok) {
			throw new Error(`API request failed: ${response.status}`);
		}

		const updatedMovies = (await response.json()) as HighlightedMovies;
		onMoviesChange(updatedMovies);
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
				const response = await fetch(`${apiUrl}/reselect`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${adminToken}`,
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

	const handleOverrideLoadingChange = useCallback((type: PeriodType, value: boolean) => {
		setActionLoading(previous => ({...previous, [type]: value}));
	}, []);

	const manualSetLabel = locale === 'ja' ? '検索して設定' : 'Search & Set';
	const closeSearchLabel = locale === 'ja' ? '検索を閉じる' : 'Close Search';
	const processingLabel = locale === 'ja' ? '処理中...' : 'Processing...';
	const noMovieLabel =
		locale === 'ja' ? '現在表示できる映画がありません。' : 'No movie selected yet.';

  return (
    <section className="py-8">
      <h2 className="text-center mb-8 text-2xl text-gray-800">
        {labels.randomMovie}
      </h2>

      {isDataLoading && (
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 text-gray-600">
            <div className="animate-spin h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full mr-3"></div>
            {locale === 'ja' ? 'データを読み込み中...' : 'Loading data...'}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-center max-w-4xl mx-auto">
          {locale === 'ja'
            ? `APIから映画データを取得できませんでした。フォールバック映画を表示しています。エラー: ${error}…`
            : `Failed to fetch movie data from API. Showing fallback movies. Error: ${error}…`}
        </div>
      )}

      <div className="flex justify-center items-start gap-8 max-w-[90%] mx-auto px-4 flex-wrap md:flex-nowrap">
        {SELECTION_PERIODS.map(period => {
          const movie = movies?.[period];
          const isLoading = Boolean(actionLoading[period]);
          const isSearchVisible = Boolean(searchOpen[period]);

          return (
            <div key={period} className="flex flex-col items-center">
              <div className="bg-blue-600 text-white px-4 py-1 rounded-t font-bold mb-2">
                {labels[period]}
              </div>

              {movie ? (
                <MovieCard movie={movie} locale={locale} adminToken={adminToken} />
              ) : (
                <p className="text-sm text-gray-500">{noMovieLabel}</p>
              )}

              {adminToken && (
                <div className="mt-4 flex w-full max-w-xs flex-col items-center gap-2">
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="sm"
                    onClick={() => {
                      void handleReselect(period);
                    }}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                        {processingLabel}
                      </div>
                    ) : (
                      labels.reselect
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setSearchOpen(previous => ({
                        ...previous,
                        [period]: !isSearchVisible,
                      }));
                    }}
                    disabled={isLoading}
                  >
                    {isSearchVisible ? closeSearchLabel : manualSetLabel}
                  </Button>
                </div>
              )}

              {adminToken && isSearchVisible && (
                <div className="mt-2 w-full max-w-xs">
                  <ManualSelectionPanel
                    period={period}
                    locale={locale}
                    apiUrl={apiUrl}
                    adminToken={adminToken}
                    onClose={() => {
                      setSearchOpen(previous => ({...previous, [period]: false}));
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
        })}
      </div>
    </section>
  );
}
