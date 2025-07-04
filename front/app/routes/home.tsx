/* eslint-disable unicorn/prefer-global-this, unicorn/catch-error-name */
import {useEffect, useState} from 'react';
import type {Route} from './+types/home';
import {Button} from '@/components/ui/button';
import {MovieCard} from '@/components/molecules/movie-card';
import {AdminLogin} from '@/components/molecules/admin-login';
import {LanguageSelector} from '@/components/molecules/language-selector';

export function meta({data: _data}: Route.MetaArgs): Route.MetaDescriptors {
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
	const localeParam = url.searchParams.get('locale');
	if (localeParam && ['en', 'ja'].includes(localeParam)) {
		return localeParam;
	}

	const acceptLanguage = request.headers.get('accept-language');
	if (acceptLanguage) {
		const languages = acceptLanguage
			.split(',')
			.map((lang) => lang.trim().split(';')[0].split('-')[0])
			.filter((lang) => ['en', 'ja'].includes(lang));

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
		function getCacheKey() {
			const now = new Date();
			const year = now.getFullYear();
			const month = now.getMonth() + 1;
			const day = now.getDate();
			const adjustedDay = now.getHours() < 6 ? day - 1 : day;
			return `${year}-${month}-${adjustedDay}`;
		}

		const cacheKey = getCacheKey();
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
		return {movies, error: undefined, locale, apiUrl};
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
		movies: any;
		error: string | undefined;
		locale: string;
		apiUrl: string;
		shouldFetchOnClient?: boolean;
	};

	const [movies, setMovies] = useState(initialMovies);
	const [error, setError] = useState<string | undefined>(initialError);
	const [loading, setLoading] = useState(shouldFetchOnClient);
	const [adminToken, setAdminToken] = useState<string | undefined>(undefined);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			setAdminToken(localStorage.getItem('adminToken') || undefined);

			const handleAdminLogin = () => {
				setAdminToken(localStorage.getItem('adminToken') || undefined);
			};

			const handleAdminLogout = () => {
				setAdminToken(undefined);
			};

			window.addEventListener('adminLogin', handleAdminLogin);
			window.addEventListener('adminLogout', handleAdminLogout);

			return () => {
				window.removeEventListener('adminLogin', handleAdminLogin);
				window.removeEventListener('adminLogout', handleAdminLogout);
			};
		}
	}, []);

	// クライアントサイドでデータフェッチ
	useEffect(() => {
		if (shouldFetchOnClient && typeof window !== 'undefined') {
			const fetchMovies = async () => {
				try {
					setLoading(true);
					setError(undefined);

					function getCacheKey() {
						const now = new Date();
						const year = now.getFullYear();
						const month = now.getMonth() + 1;
						const day = now.getDate();
						const adjustedDay = now.getHours() < 6 ? day - 1 : day;
						return `${year}-${month}-${adjustedDay}`;
					}

					const cacheKey = getCacheKey();
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

					const fetchedMovies = await response.json();
					setMovies(fetchedMovies);
				} catch (err) {
					console.error('Error fetching movies:', err);
					setError(
						err instanceof Error ? err.message : 'Unknown error occurred',
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

			fetchMovies();
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
				/>
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
}: {
	movies: any;
	error: string | undefined;
	locale: string;
	apiUrl: string;
	adminToken: string | undefined;
	labels: any;
	loading?: boolean;
}) {
	const [reselectLoading, setReselectLoading] = useState<
		Record<string, boolean>
	>({});

	const handleReselect = async (type: string) => {
		if (!adminToken) {
			alert(
				locale === 'ja'
					? '管理者としてログインしてください'
					: 'Please login as admin',
			);
			return;
		}

		setReselectLoading((prev) => ({...prev, [type]: true}));

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

			const result = (await response.json()) as {movie?: any};

			if (result.movie) {
				window.location.reload();
			}
		} catch (error) {
			console.error('Error re-selecting movie:', error);
			alert(
				locale === 'ja'
					? 'エラーが発生しました。再度お試しください。'
					: 'An error occurred. Please try again.',
			);
		} finally {
			setReselectLoading((prev) => ({...prev, [type]: false}));
		}
	};

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
						? `APIから映画データを取得できませんでした。フォールバック映画を表示しています。エラー: ${error} | API URL: ${apiUrl}`
						: `Failed to fetch movie data from API. Showing fallback movies. Error: ${error} | API URL: ${apiUrl}`}
				</div>
			)}

			{movies && !isDataLoading && (
				<div className="flex justify-center items-start gap-8 max-w-[90%] mx-auto px-4 flex-wrap md:flex-nowrap">
					{['daily', 'weekly', 'monthly'].map((period) => (
						<div key={period} className="flex flex-col items-center">
							<div className="bg-blue-600 text-white px-4 py-1 rounded-t font-bold mb-2">
								{labels[period]}
							</div>
							{movies[period] && (
								<MovieCard
									movie={movies[period]}
									locale={locale}
									adminToken={adminToken}
								/>
							)}
							{adminToken && (
								<Button
									onClick={async () => handleReselect(period)}
									disabled={reselectLoading[period]}
									className="mt-4 bg-green-600 hover:bg-green-700"
									size="sm"
								>
									{reselectLoading[period] ? (
										<div className="flex items-center justify-center">
											<div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
											{labels.reselect}
										</div>
									) : (
										labels.reselect
									)}
								</Button>
							)}
						</div>
					))}
				</div>
			)}
		</section>
	);
}
