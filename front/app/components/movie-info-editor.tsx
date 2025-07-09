import {useState} from 'react';

type MovieDetails = {
	uid: string;
	year: number;
	originalLanguage: string;
	imdbId: string | undefined;
	tmdbId: number | undefined;
	translations: Array<{
		uid: string;
		languageCode: string;
		content: string;
		isDefault: number;
	}>;
	nominations: Array<{
		uid: string;
		isWinner: boolean;
		specialMention: string | undefined;
		category: {uid: string; name: string};
		ceremony: {uid: string; number: number; year: number};
		organization: {uid: string; name: string; shortName: string};
	}>;
	posters: Array<{
		uid: string;
		url: string;
		width: number | undefined;
		height: number | undefined;
		languageCode: string | undefined;
		source: string | undefined;
		isPrimary: number;
	}>;
};

type MovieInfoEditorProps = {
	movieData: MovieDetails;
	apiUrl: string;
	movieId: string;
	onMovieDataUpdate: (movieData: MovieDetails) => void;
};

export default function MovieInfoEditor({
	movieData,
	apiUrl,
	movieId,
	onMovieDataUpdate,
}: MovieInfoEditorProps) {
	const [editingImdbId, setEditingImdbId] = useState(false);
	const [newImdbId, setNewImdbId] = useState('');
	const [imdbError, setImdbError] = useState<string | undefined>(undefined);
	const [fetchTmdbData, setFetchTmdbData] = useState(false);

	const [editingTmdbId, setEditingTmdbId] = useState(false);
	const [newTmdbId, setNewTmdbId] = useState('');
	const [tmdbError, setTmdbError] = useState<string | undefined>(undefined);

	const [tmdbRefreshing, setTmdbRefreshing] = useState(false);
	const [tmdbRefreshError, setTmdbRefreshError] = useState<string | undefined>(
		undefined,
	);

	const updateImdbId = async () => {
		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		try {
			const response = await fetch(
				`${apiUrl}/admin/movies/${movieId}/imdb-id`,
				{
					method: 'PUT',
					headers: {
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						imdbId: newImdbId.trim() || undefined,
						fetchTmdbData,
					}),
				},
			);

			if (response.status === 401) {
				globalThis.localStorage?.removeItem('adminToken');
				globalThis.location.href = '/admin/login';
				return;
			}

			if (!response.ok) {
				const errorData = (await response
					.json()
					.catch(() => ({error: 'Unknown error'}))) as {error?: string};
				throw new Error(errorData.error || 'Failed to update IMDb ID');
			}

			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				onMovieDataUpdate(data);
			}

			setEditingImdbId(false);
			setNewImdbId('');
			setImdbError(undefined);
			setFetchTmdbData(false);

			globalThis.alert?.('IMDb IDを更新しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update IMDb ID';
			setImdbError(message);
			console.error('Update IMDb ID error:', error);
		}
	};

	const updateTmdbId = async () => {
		const tmdbIdNumber = newTmdbId.trim()
			? Number.parseInt(newTmdbId.trim(), 10)
			: undefined;

		if (
			newTmdbId.trim() &&
			(tmdbIdNumber === undefined ||
				Number.isNaN(tmdbIdNumber) ||
				tmdbIdNumber <= 0)
		) {
			setTmdbError('TMDb IDは正の整数である必要があります');
			return;
		}

		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		try {
			const response = await fetch(
				`${apiUrl}/admin/movies/${movieId}/tmdb-id`,
				{
					method: 'PUT',
					headers: {
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						tmdbId: tmdbIdNumber,
					}),
				},
			);

			if (response.status === 401) {
				globalThis.localStorage?.removeItem('adminToken');
				globalThis.location.href = '/admin/login';
				return;
			}

			if (response.status === 404) {
				setTmdbError('TMDb ID更新機能はまだ実装されていません');
				return;
			}

			if (!response.ok) {
				const errorData = (await response
					.json()
					.catch(() => ({error: 'Unknown error'}))) as {error?: string};
				throw new Error(errorData.error || 'Failed to update TMDb ID');
			}

			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				onMovieDataUpdate(data);
			}

			setEditingTmdbId(false);
			setNewTmdbId('');
			setTmdbError(undefined);

			globalThis.alert?.('TMDb IDを更新しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update TMDb ID';
			setTmdbError(message);
			console.error('Update TMDb ID error:', error);
		}
	};

	const refreshTMDbData = async () => {
		if (!movieData?.tmdbId) {
			setTmdbRefreshError('TMDb IDが設定されていません');
			return;
		}

		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		setTmdbRefreshing(true);
		setTmdbRefreshError(undefined);

		try {
			const response = await fetch(
				`${apiUrl}/admin/movies/${movieId}/refresh-tmdb`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${token}`,
					},
				},
			);

			if (response.status === 401) {
				globalThis.localStorage?.removeItem('adminToken');
				globalThis.location.href = '/admin/login';
				return;
			}

			if (!response.ok) {
				const errorData = (await response
					.json()
					.catch(() => ({error: 'Unknown error'}))) as {error?: string};
				throw new Error(errorData.error || 'Failed to refresh TMDb data');
			}

			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				onMovieDataUpdate(data);
			}

			globalThis.alert?.('TMDb情報を更新しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to refresh TMDb data';
			setTmdbRefreshError(message);
			console.error('Refresh TMDb data error:', error);
		} finally {
			setTmdbRefreshing(false);
		}
	};

	return (
		<div className="bg-white rounded-lg shadow p-6">
			<h3 className="text-lg font-medium text-gray-900 mb-4">映画情報</h3>

			<div className="space-y-6">
				<div>
					<strong className="text-gray-700">映画ID:</strong> {movieData.uid}
				</div>
				<div>
					<strong className="text-gray-700">公開年:</strong> {movieData.year}
				</div>
				<div>
					<strong className="text-gray-700">原語:</strong>{' '}
					{movieData.originalLanguage}
				</div>

				{/* IMDb ID */}
				<div>
					<div className="flex items-center space-x-2 mb-2">
						<strong className="text-gray-700">IMDb ID:</strong>
						{editingImdbId ? (
							<div className="flex items-center space-x-2">
								<input
									type="text"
									value={newImdbId}
									onChange={(e) => setNewImdbId(e.target.value)}
									className="px-2 py-1 border border-gray-300 rounded text-sm"
									placeholder="tt1234567"
								/>
								<div className="flex items-center space-x-2">
									<input
										type="checkbox"
										id="fetchTmdbData"
										checked={fetchTmdbData}
										onChange={(e) => setFetchTmdbData(e.target.checked)}
										className="mr-1"
									/>
									<label htmlFor="fetchTmdbData" className="text-sm">
										TMDb から追加データを取得
									</label>
								</div>
								<button
									type="button"
									onClick={updateImdbId}
									className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
								>
									保存
								</button>
								<button
									type="button"
									onClick={() => {
										setEditingImdbId(false);
										setNewImdbId('');
										setImdbError(undefined);
										setFetchTmdbData(false);
									}}
									className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600"
								>
									キャンセル
								</button>
							</div>
						) : (
							<div className="flex items-center space-x-2">
								<span>{movieData.imdbId || '未設定'}</span>
								<button
									type="button"
									onClick={() => {
										setEditingImdbId(true);
										setNewImdbId(movieData.imdbId || '');
									}}
									className="text-blue-600 hover:text-blue-800 text-sm"
								>
									編集
								</button>
							</div>
						)}
					</div>
					{imdbError && <p className="text-red-600 text-sm">{imdbError}</p>}
				</div>

				{/* TMDb ID */}
				<div>
					<div className="flex items-center space-x-2 mb-2">
						<strong className="text-gray-700">TMDb ID:</strong>
						{editingTmdbId ? (
							<div className="flex items-center space-x-2">
								<input
									type="number"
									value={newTmdbId}
									onChange={(e) => setNewTmdbId(e.target.value)}
									className="px-2 py-1 border border-gray-300 rounded text-sm w-24"
									placeholder="12345"
								/>
								<button
									type="button"
									onClick={updateTmdbId}
									className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
								>
									保存
								</button>
								<button
									type="button"
									onClick={() => {
										setEditingTmdbId(false);
										setNewTmdbId('');
										setTmdbError(undefined);
									}}
									className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600"
								>
									キャンセル
								</button>
							</div>
						) : (
							<div className="flex items-center space-x-2">
								<span>{movieData.tmdbId || '未設定'}</span>
								<button
									type="button"
									onClick={() => {
										setEditingTmdbId(true);
										setNewTmdbId(movieData.tmdbId?.toString() || '');
									}}
									className="text-blue-600 hover:text-blue-800 text-sm"
								>
									編集
								</button>
								{movieData.tmdbId && (
									<button
										type="button"
										onClick={refreshTMDbData}
										disabled={tmdbRefreshing}
										className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 disabled:bg-gray-400"
									>
										{tmdbRefreshing ? '更新中...' : 'TMDb情報更新'}
									</button>
								)}
							</div>
						)}
					</div>
					{tmdbError && <p className="text-red-600 text-sm">{tmdbError}</p>}
				</div>

				{/* TMDb更新エラー */}
				{tmdbRefreshError && (
					<div className="p-3 bg-red-50 border border-red-200 rounded text-red-600">
						{tmdbRefreshError}
					</div>
				)}
			</div>
		</div>
	);
}
