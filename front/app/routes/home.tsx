/* eslint-disable unicorn/prefer-global-this, unicorn/catch-error-name */
import {useEffect, useRef, useState} from 'react';
import type {Route} from './+types/home';
import {Button} from '@routes/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@routes/components/ui/card';

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

function AdminLogin({locale, apiUrl}: {locale: string; apiUrl?: string}) {
	const [showModal, setShowModal] = useState(false);
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [password, setPassword] = useState('');
	const [error, setError] = useState(false);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			const token = localStorage.getItem('adminToken') || undefined;
			setIsLoggedIn(Boolean(token));
		}
	}, []);

	const translations = {
		en: {
			adminButton: 'Admin',
			loginTitle: 'Admin Login',
			passwordPlaceholder: 'Enter password',
			loginButton: 'Login',
			cancelButton: 'Cancel',
			loginError: 'Invalid password',
			logoutButton: 'Logout',
		},
		ja: {
			adminButton: '管理者',
			loginTitle: '管理者ログイン',
			passwordPlaceholder: 'パスワードを入力',
			loginButton: 'ログイン',
			cancelButton: 'キャンセル',
			loginError: 'パスワードが正しくありません',
			logoutButton: 'ログアウト',
		},
	};

	const t =
		translations[locale as keyof typeof translations] || translations.en;

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();

		try {
			const response = await fetch(
				`${apiUrl || 'http://localhost:8787'}/auth/login`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({password}),
				},
			);

			if (response.ok) {
				const {token} = (await response.json()) as {token: string};
				localStorage.setItem('adminToken', token);
				setIsLoggedIn(true);
				setShowModal(false);
				setPassword('');
				setError(false);
				window.dispatchEvent(new Event('adminLogin'));
			} else {
				setError(true);
			}
		} catch (err) {
			console.error('Login error:', err);
			setError(true);
		}
	};

	const handleLogout = () => {
		localStorage.removeItem('adminToken');
		setIsLoggedIn(false);
		window.dispatchEvent(new Event('adminLogout'));
	};

	const handleButtonClick = () => {
		if (isLoggedIn) {
			handleLogout();
		} else {
			setShowModal(true);
		}
	};

	return (
		<div className="fixed top-4 right-4 z-50">
			<Button
				onClick={handleButtonClick}
				variant={isLoggedIn ? 'default' : 'secondary'}
				size="sm"
			>
				{isLoggedIn ? t.logoutButton : t.adminButton}
			</Button>

			{showModal && (
				<div
					className="fixed top-0 left-0 w-full h-full bg-black/50 flex items-center justify-center z-50"
					onClick={(e) => {
						if (e.target === e.currentTarget) {
							setShowModal(false);
							setPassword('');
							setError(false);
						}
					}}
				>
					<div className="bg-white p-8 rounded-lg w-full max-w-md mx-4">
						<h2 className="mb-6 text-xl">{t.loginTitle}</h2>
						<form onSubmit={handleLogin}>
							<input
								type="password"
								value={password}
								onChange={(e) => {
									setPassword(e.target.value);
								}}
								placeholder={t.passwordPlaceholder}
								className="w-full p-3 border border-gray-300 rounded text-base mb-4"
								required
								autoFocus
							/>
							<div className="flex gap-4 justify-end">
								<Button type="submit">{t.loginButton}</Button>
								<Button
									type="button"
									onClick={() => {
										setShowModal(false);
										setPassword('');
										setError(false);
									}}
									variant="secondary"
								>
									{t.cancelButton}
								</Button>
							</div>
						</form>
						{error && (
							<div className="text-red-600 text-sm mt-4">{t.loginError}</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function LanguageSelector({locale}: {locale: string}) {
	const languages = [
		{code: 'en', name: 'English'},
		{code: 'ja', name: '日本語'},
	];

	const getCurrentUrl = (newLocale: string): string => {
		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			url.searchParams.set('locale', newLocale);
			return url.toString();
		}

		return `?locale=${newLocale}`;
	};

	return (
		<div className="flex gap-2 my-4 justify-center">
			{languages.map((lang) => (
				<a
					key={lang.code}
					href={getCurrentUrl(lang.code)}
					className={`px-4 py-2 border rounded text-sm no-underline transition-all duration-200 ${
						locale === lang.code
							? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700'
							: 'text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
					}`}
				>
					{lang.name}
				</a>
			))}
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

function MovieCard({
	movie,
	locale = 'en',
	adminToken,
}: {
	movie: any;
	locale?: string;
	adminToken?: string;
}) {
	const [showStreamingMenu, setShowStreamingMenu] = useState(false);
	const [showDetails, setShowDetails] = useState(false);
	const cardRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
				setShowStreamingMenu(false);
			}
		};

		if (showStreamingMenu) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [showStreamingMenu]);

	const labels = {
		en: {
			noPoster: 'No Poster',
			winner: 'Winner',
			nominee: 'Nominee',
			edit: 'Edit',
			relatedArticles: 'Submitted Links',
			addArticle: 'Add Link',
			showMore: 'Show details',
			showLess: 'Hide details',
			searchOn: 'Search on',
			adminEdit: 'Edit Movie',
		},
		ja: {
			noPoster: 'ポスターなし',
			winner: '受賞',
			nominee: 'ノミネート',
			edit: '編集',
			relatedArticles: '投稿されたリンク',
			addArticle: 'リンクを追加',
			showMore: '詳細を表示',
			showLess: '詳細を隠す',
			searchOn: '検索する',
			adminEdit: '映画を編集',
		},
	};

	const t = labels[locale as keyof typeof labels] || labels.en;

	const streamingServices = [
		{
			name: 'U-NEXT',
			color: 'bg-black text-white',
			url: (title: string) =>
				`https://video.unext.jp/freeword?query=${encodeURIComponent(title)}`,
		},
		{
			name: 'Amazon Prime',
			color: 'bg-blue-600 text-white',
			url: (title: string) =>
				`https://www.amazon.co.jp/s?k=${encodeURIComponent(
					title,
				)}&i=prime-instant-video`,
		},
		{
			name: 'TMDb',
			color: 'bg-green-600 text-white',
			url: (title: string) =>
				`https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`,
		},
		{
			name: 'Filmarks',
			color: 'bg-purple-600 text-white',
			url: (title: string) =>
				`https://filmarks.com/search/movies?q=${encodeURIComponent(title)}`,
		},
	];

	// Group nominations by organization and ceremony
	const nominationsByOrg =
		movie.nominations?.reduce(
			(acc: any, nom: any) => {
				const orgKey = nom.organization.uid;
				if (!acc[orgKey]) {
					acc[orgKey] = {
						organization: nom.organization,
						ceremonies: {},
					};
				}

				const ceremonyKey = nom.ceremony.uid;
				if (!acc[orgKey].ceremonies[ceremonyKey]) {
					acc[orgKey].ceremonies[ceremonyKey] = {
						ceremony: nom.ceremony,
						nominations: [],
					};
				}

				acc[orgKey].ceremonies[ceremonyKey].nominations.push(nom);
				return acc;
			},
			{} as Record<string, any>,
		) || {};

	const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

	return (
		<Card ref={cardRef} className="relative h-full w-80 overflow-hidden">
			<div
				className="h-[400px] md:h-[450px] bg-gray-100 flex items-center justify-center relative cursor-pointer"
				onMouseEnter={() => !isMobile && setShowStreamingMenu(true)}
				onMouseLeave={() => !isMobile && setShowStreamingMenu(false)}
				onClick={() => isMobile && setShowStreamingMenu(!showStreamingMenu)}
			>
				{movie.posterUrl ? (
					<img
						src={movie.posterUrl}
						alt={`${movie.title} poster`}
						className="w-full h-full object-cover"
					/>
				) : (
					<div className="text-gray-500 text-xl">{t.noPoster}</div>
				)}

				{/* Streaming services hover menu */}
				{showStreamingMenu && (
					<div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
						<div className="bg-white rounded-lg p-6 max-w-xs w-full mx-4">
							<h4 className="text-lg font-semibold text-gray-900 mb-4 text-center">
								{t.searchOn}
							</h4>
							<div className="grid grid-cols-1 gap-3">
								{streamingServices.map((service) => (
									<a
										key={service.name}
										href={service.url(movie.title)}
										target="_blank"
										rel="noopener noreferrer"
										className={`block px-4 py-3 rounded-md text-center text-sm font-medium ${service.color}`}
										onClick={(e) => {
											e.stopPropagation();
										}}
									>
										{service.name}
									</a>
								))}
							</div>
							<a
								href={
									movie.imdbUrl ||
									`https://www.imdb.com/find?q=${encodeURIComponent(
										movie.title + ' ' + movie.year,
									)}`
								}
								target="_blank"
								rel="noopener noreferrer"
								className="block px-4 py-3 mt-3 bg-yellow-500 text-gray-900 rounded-md text-center text-sm font-medium"
								onClick={(e) => {
									e.stopPropagation();
								}}
							>
								IMDb
							</a>
							<a
								href={`https://www.google.com/search?q=${encodeURIComponent(
									movie.title +
										' ' +
										movie.year +
										' ' +
										(locale === 'ja' ? '映画' : 'movie'),
								)}`}
								target="_blank"
								rel="noopener noreferrer"
								className="block px-4 py-3 mt-3 bg-gray-600 text-white rounded-md text-center text-sm font-medium"
								onClick={(e) => {
									e.stopPropagation();
								}}
							>
								Google
							</a>
						</div>
					</div>
				)}
			</div>

			<CardHeader>
				<CardTitle className="text-xl md:text-2xl">{movie.title}</CardTitle>
				<CardDescription className="text-lg">{movie.year}</CardDescription>
			</CardHeader>
			<CardContent className="flex-grow flex flex-col">
				<div
					className={`${
						isMobile && !showDetails ? 'max-h-0 overflow-hidden' : 'max-h-none'
					} transition-all duration-300`}
				>
					{movie.nominations && movie.nominations.length > 0 && (
						<div className="mt-auto pt-4 border-t border-gray-200">
							{Object.values(nominationsByOrg).map((orgData: any) => (
								<div key={orgData.organization.uid} className="mb-4 last:mb-0">
									<h4 className="text-sm font-semibold text-gray-700 mb-2">
										{orgData.organization.shortName ||
											orgData.organization.name}
									</h4>
									{Object.values(orgData.ceremonies).map(
										(ceremonyData: any) => (
											<div key={ceremonyData.ceremony.uid} className="mb-2">
												<span className="text-xs text-gray-600 font-medium">
													{ceremonyData.ceremony.year}
												</span>
												<ul className="list-none p-0 mt-1">
													{ceremonyData.nominations.map((nom: any) => (
														<li
															key={nom.uid}
															className="text-xs py-1 flex items-center justify-between"
														>
															<span className="text-gray-700">
																{nom.category.name}
															</span>
															<span
																className={`text-xs px-2 py-1 rounded font-medium ml-2 ${
																	nom.isWinner
																		? 'bg-yellow-400 text-gray-900'
																		: 'bg-gray-200 text-gray-700'
																}`}
															>
																{nom.isWinner ? t.winner : t.nominee}
															</span>
														</li>
													))}
												</ul>
											</div>
										),
									)}
								</div>
							))}
						</div>
					)}
					{movie.articleLinks && movie.articleLinks.length > 0 && (
						<div className="px-6 pb-2 border-t border-gray-200">
							<h4 className="text-sm font-semibold text-gray-700 mt-4 mb-3">
								{t.relatedArticles}
							</h4>
							<ul className="list-none p-0 m-0">
								{movie.articleLinks.map((article: any) => (
									<li key={article.uid} className="mb-1.5 last:mb-0">
										<a
											href={article.url}
											target="_blank"
											rel="noopener noreferrer"
											className="block px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md no-underline text-inherit transition-all duration-200 hover:bg-gray-100 hover:border-gray-300 hover:translate-x-0.5"
										>
											<span className="text-xs text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap block leading-snug">
												{article.title}
											</span>
										</a>
									</li>
								))}
							</ul>
						</div>
					)}
					<a
						href={`/movies/${movie.uid}`}
						className="inline-block mx-6 my-3 px-2 py-1 text-gray-500 no-underline rounded text-xs font-normal transition-all duration-200 border border-transparent hover:text-gray-700 hover:bg-gray-100 hover:border-gray-200"
					>
						+ {t.addArticle}
					</a>
					{adminToken && (
						<a
							href={`/admin/movies/${movie.uid}`}
							className="inline-block mx-6 my-1 px-2 py-1 bg-blue-600 text-white no-underline rounded text-xs font-medium transition-all duration-200 hover:bg-blue-700"
						>
							{t.adminEdit}
						</a>
					)}
				</div>
				{isMobile && (
					<Button
						onClick={() => {
							setShowDetails(!showDetails);
						}}
						variant="outline"
						className="w-full mt-3 text-gray-500"
						size="sm"
					>
						<span>{showDetails ? t.showLess : t.showMore}</span>
						<span
							className={`text-xs transition-transform duration-200 ${
								showDetails ? 'rotate-180' : ''
							}`}
						>
							▼
						</span>
					</Button>
				)}
			</CardContent>
		</Card>
	);
}
