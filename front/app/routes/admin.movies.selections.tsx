import {useEffect, useState} from 'react';
import type {Route} from './+types/admin.movies.selections';

type SelectionData = {
	date: string;
	movie:
		| {
				uid: string;
				title: string;
				year: number;
				posterUrl?: string;
				nominations?: Array<{
					uid: string;
					isWinner: boolean;
					category: {name: string};
					ceremony: {year: number};
					organization: {name: string};
				}>;
		  }
		| undefined;
};

type PreviewSelections = {
	nextDaily: SelectionData;
	nextWeekly: SelectionData;
	nextMonthly: SelectionData;
};

type SearchMovie = {
	uid: string;
	year: number | undefined;
	title?: string;
	translations?: Array<{
		languageCode: string;
		content: string;
		isDefault: number;
	}>;
	nominations: Array<{
		uid: string;
		isWinner: boolean;
		category: {name: string};
		ceremony: {year: number};
		organization: {name: string};
	}>;
};

export function meta({data: _data}: Route.MetaArgs): Route.MetaDescriptors {
	return [
		{title: '映画選択管理 - SHINE Admin'},
		{name: 'description', content: 'SHINE Admin 映画選択管理画面'},
	];
}

export async function loader({context}: Route.LoaderArgs) {
	return {
		apiUrl:
			(context.cloudflare as {env: {PUBLIC_API_URL?: string}}).env
				.PUBLIC_API_URL || 'http://localhost:8787',
	};
}

const handleLogout = () => {
	if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
		globalThis.localStorage.removeItem('adminToken');
		globalThis.location.href = '/admin/login';
	}
};

export default function AdminMovieSelections({
	loaderData,
}: Route.ComponentProps) {
	const {apiUrl} = loaderData as {apiUrl: string};

	const [selections, setSelections] = useState<PreviewSelections | undefined>(
		undefined,
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

	// Override modal states
	const [showOverrideModal, setShowOverrideModal] = useState(false);
	const [overrideType, setOverrideType] = useState<
		'daily' | 'weekly' | 'monthly'
	>('daily');
	const [activeTab, setActiveTab] = useState<'search' | 'random'>('search');

	// Search states
	const [searchQuery, setSearchQuery] = useState('');
	const [searchResults, setSearchResults] = useState<SearchMovie[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);

	// Random movie states
	const [randomMovie, setRandomMovie] = useState<SearchMovie | undefined>(
		undefined,
	);
	const [randomLoading, setRandomLoading] = useState(false);

	// Selected movie for override
	const [selectedMovie, setSelectedMovie] = useState<SearchMovie | undefined>(
		undefined,
	);

	// Load movie selections
	useEffect(() => {
		const loadSelections = async () => {
			if (globalThis.window === undefined) return;

			const token = globalThis.localStorage.getItem('adminToken');
			if (!token) {
				globalThis.location.href = '/admin/login';
				return;
			}

			setLoading(true);
			setError(undefined);

			try {
				const response = await fetch(`${apiUrl}/admin/preview-selections`, {
					headers: {Authorization: `Bearer ${token}`},
				});

				if (response.status === 401) {
					globalThis.localStorage.removeItem('adminToken');
					globalThis.location.href = '/admin/login';
					return;
				}

				if (!response.ok) {
					throw new Error('Failed to fetch selections');
				}

				const data = await response.json();
				setSelections(data);
			} catch (error) {
				console.error('Error loading selections:', error);
				setError('Failed to load movie selections');
			} finally {
				setLoading(false);
			}
		};

		loadSelections();
	}, [apiUrl]);

	// Search movies with debounce
	useEffect(() => {
		if (!searchQuery.trim()) {
			setSearchResults([]);
			return;
		}

		const timeoutId = setTimeout(async () => {
			setSearchLoading(true);
			try {
				const token = globalThis.localStorage.getItem('adminToken');
				const response = await fetch(
					`${apiUrl}/admin/movies?search=${encodeURIComponent(
						searchQuery,
					)}&limit=20`,
					{headers: {Authorization: `Bearer ${token}`}},
				);

				if (response.ok) {
					const data = await response.json();
					setSearchResults(data.movies || []);
				}
			} catch (error) {
				console.error('Search error:', error);
			} finally {
				setSearchLoading(false);
			}
		}, 300);

		return () => {
			clearTimeout(timeoutId);
		};
	}, [searchQuery, apiUrl]);

	const generateRandomMovie = async () => {
		setRandomLoading(true);
		try {
			const token = globalThis.localStorage.getItem('adminToken');
			const response = await fetch(`${apiUrl}/admin/random-movie-preview`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					type: overrideType,
					date:
						selections?.[
							`next${
								overrideType.charAt(0).toUpperCase() + overrideType.slice(1)
							}` as keyof PreviewSelections
						]?.date || new Date().toISOString().split('T')[0],
					locale: 'en',
				}),
			});

			if (response.ok) {
				const data = await response.json();
				setRandomMovie(data);
			}
		} catch (error) {
			console.error('Random movie error:', error);
		} finally {
			setRandomLoading(false);
		}
	};

	const handleOverride = async () => {
		if (!selectedMovie) return;

		try {
			const token = globalThis.localStorage.getItem('adminToken');
			const response = await fetch(`${apiUrl}/admin/override-selection`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					type: overrideType,
					date:
						selections?.[
							`next${
								overrideType.charAt(0).toUpperCase() + overrideType.slice(1)
							}` as keyof PreviewSelections
						]?.date || new Date().toISOString().split('T')[0],
					movieId: selectedMovie.uid,
				}),
			});

			if (response.ok) {
				// Reload selections
				globalThis.location.reload();
			}
		} catch (error) {
			console.error('Override error:', error);
		}
	};

	const openOverrideModal = (type: 'daily' | 'weekly' | 'monthly') => {
		setOverrideType(type);
		setShowOverrideModal(true);
		setActiveTab('search');
		setSearchQuery('');
		setSearchResults([]);
		setRandomMovie(undefined);
		setSelectedMovie(undefined);
	};

	const getTypeLabel = (type: string) => {
		switch (type) {
			case 'daily': {
				return '今日の映画';
			}

			case 'weekly': {
				return '今週の映画';
			}

			case 'monthly': {
				return '今月の映画';
			}

			default: {
				return type;
			}
		}
	};

	const getTypeColor = (type: string) => {
		switch (type) {
			case 'daily': {
				return 'from-blue-500 to-blue-600';
			}

			case 'weekly': {
				return 'from-green-500 to-green-600';
			}

			case 'monthly': {
				return 'from-purple-500 to-purple-600';
			}

			default: {
				return 'from-gray-500 to-gray-600';
			}
		}
	};

	const getPrimaryTitle = (movie: SelectionData['movie'] | SearchMovie) => {
		if (!movie) return '無題';
		if ('title' in movie && movie.title) return movie.title;
		if ('translations' in movie && movie.translations) {
			return (
				movie.translations.find((t: any) => t.isDefault === 1)?.content ||
				movie.translations.find((t: any) => t.languageCode === 'ja')?.content ||
				movie.translations[0]?.content ||
				'無題'
			);
		}

		return '無題';
	};

	if (loading) {
		return (
			<div
				style={{
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					minHeight: '50vh',
				}}
			>
				<div style={{color: '#6b7280'}}>読み込み中...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div
				style={{
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					minHeight: '50vh',
				}}
			>
				<div style={{color: '#ef4444'}}>{error}</div>
			</div>
		);
	}

	return (
		<main className="min-h-screen bg-gray-50 py-8">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<div className="flex items-center justify-between mb-8">
					<div className="flex items-center space-x-4">
						<h1 className="text-3xl font-bold text-gray-900">映画選択管理</h1>
					</div>
					<div className="flex items-center space-x-4">
						<a
							href="/"
							className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
						>
							トップページ
						</a>
						<a
							href="/admin/movies"
							className="text-gray-600 hover:text-gray-900 transition-colors"
						>
							← 映画一覧に戻る
						</a>
						<button
							onClick={handleLogout}
							className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
						>
							ログアウト
						</button>
					</div>
				</div>

				{/* Selection Cards Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
					{(['daily', 'weekly', 'monthly'] as const).map((type) => {
						const selection =
							selections?.[
								`next${
									type.charAt(0).toUpperCase() + type.slice(1)
								}` as keyof PreviewSelections
							];
						return (
							<div
								key={type}
								data-testid={`${type}-selection`}
								className="bg-white rounded-lg shadow-lg overflow-hidden"
							>
								{/* Card Header */}
								<div
									className={`bg-gradient-to-r ${getTypeColor(
										type,
									)} p-6 text-white`}
								>
									<h2 className="text-xl font-bold">{getTypeLabel(type)}</h2>
									{selection && (
										<p className="text-sm opacity-90 mt-1">
											選択日時:{' '}
											{new Date(selection.date).toLocaleDateString('ja-JP')}
										</p>
									)}
								</div>

								{/* Card Content */}
								<div className="p-6">
									{selection?.movie ? (
										<div>
											{/* Movie Info */}
											<div className="mb-4">
												<h3 className="text-lg font-semibold text-gray-900 mb-2">
													{getPrimaryTitle(selection.movie)}
												</h3>
												<p className="text-gray-600">
													{selection.movie.year && `${selection.movie.year}年`}
												</p>
												{selection.movie.nominations &&
													selection.movie.nominations.length > 0 && (
														<p className="text-sm text-gray-500 mt-1">
															ノミネート: {selection.movie.nominations.length}件
														</p>
													)}
											</div>

											{/* Poster */}
											{selection.movie.posterUrl && (
												<img
													src={selection.movie.posterUrl}
													alt={getPrimaryTitle(selection.movie)}
													className="w-full h-48 object-cover rounded-lg mb-4"
												/>
											)}

											{/* Actions */}
											<div className="flex space-x-2">
												<button
													onClick={() => {
														openOverrideModal(type);
													}}
													className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
												>
													Override Selection
												</button>
												<a
													href={`/admin/movies/${selection.movie.uid}`}
													className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-center"
												>
													Edit Movie
												</a>
											</div>
										</div>
									) : (
										<div className="text-center text-gray-500">
											<p className="mb-4">選択された映画がありません</p>
											<button
												onClick={() => {
													openOverrideModal(type);
												}}
												className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
											>
												映画を選択
											</button>
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>

				{/* Override Modal */}
				{showOverrideModal && (
					<div
						data-testid="override-modal"
						className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
					>
						<div className="bg-white rounded-lg w-full max-w-4xl max-h-screen overflow-auto m-4">
							<div className="p-6 border-b">
								<h3 className="text-xl font-bold">映画選択をオーバーライド</h3>
								<p className="text-gray-600">
									{getTypeLabel(overrideType)}の選択
								</p>
							</div>

							{/* Tabs */}
							<div className="border-b">
								<div className="flex">
									<button
										data-testid="search-tab"
										onClick={() => {
											setActiveTab('search');
										}}
										className={`px-6 py-3 font-medium ${
											activeTab === 'search'
												? 'border-b-2 border-blue-600 text-blue-600'
												: 'text-gray-600 hover:text-gray-900'
										}`}
									>
										映画を検索
									</button>
									<button
										data-testid="random-tab"
										onClick={() => {
											setActiveTab('random');
										}}
										className={`px-6 py-3 font-medium ${
											activeTab === 'random'
												? 'border-b-2 border-blue-600 text-blue-600'
												: 'text-gray-600 hover:text-gray-900'
										}`}
									>
										ランダム選択
									</button>
								</div>
							</div>

							{/* Tab Content */}
							<div className="p-6">
								{activeTab === 'search' && (
									<div>
										<input
											data-testid="movie-search-input"
											type="text"
											placeholder="映画タイトルを検索..."
											value={searchQuery}
											onChange={(e) => {
												setSearchQuery(e.target.value);
											}}
											className="w-full p-3 border border-gray-300 rounded-lg mb-4"
										/>

										{searchLoading && (
											<div className="text-center text-gray-600">検索中...</div>
										)}

										<div
											data-testid="search-results"
											className="space-y-2 max-h-96 overflow-y-auto"
										>
											{searchResults.map((movie) => (
												<div
													key={movie.uid}
													onClick={() => {
														setSelectedMovie(movie);
													}}
													className={`p-4 border rounded-lg cursor-pointer transition-colors ${
														selectedMovie?.uid === movie.uid
															? 'border-blue-600 bg-blue-50'
															: 'border-gray-200 hover:border-gray-300'
													}`}
												>
													<h4 className="font-medium">
														{getPrimaryTitle(movie)}
													</h4>
													<p className="text-sm text-gray-600">
														{movie.year && `${movie.year}年`}
														{movie.nominations?.length > 0 &&
															` • ${movie.nominations.length}件のノミネート`}
													</p>
												</div>
											))}
										</div>
									</div>
								)}

								{activeTab === 'random' && (
									<div className="text-center">
										<button
											onClick={generateRandomMovie}
											disabled={randomLoading}
											className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
										>
											{randomLoading
												? 'ランダム映画を生成中...'
												: 'ランダム映画を生成'}
										</button>

										{randomMovie && (
											<div
												data-testid="random-movie-result"
												className="mt-6 p-4 border border-gray-200 rounded-lg cursor-pointer"
												onClick={() => {
													setSelectedMovie(randomMovie);
												}}
											>
												<h4 className="font-medium">
													{getPrimaryTitle(randomMovie)}
												</h4>
												<p className="text-sm text-gray-600">
													{randomMovie.year && `${randomMovie.year}年`}
													{randomMovie.nominations?.length > 0 &&
														` • ${randomMovie.nominations.length}件のノミネート`}
												</p>
											</div>
										)}
									</div>
								)}
							</div>

							{/* Modal Actions */}
							<div className="p-6 border-t flex justify-end space-x-4">
								<button
									onClick={() => {
										setShowOverrideModal(false);
									}}
									className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
								>
									キャンセル
								</button>
								<button
									onClick={handleOverride}
									disabled={!selectedMovie}
									className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
								>
									選択を確定
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</main>
	);
}
