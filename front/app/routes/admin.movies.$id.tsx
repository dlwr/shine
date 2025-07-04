import {useEffect, useState} from 'react';
import type {Route} from './+types/admin.movies.$id';

type Translation = {
	uid: string;
	languageCode: string;
	content: string;
	isDefault: number; // 1 or 0 from database
};

type Nomination = {
	uid: string;
	isWinner: boolean;
	specialMention: string | undefined;
	category: {
		uid: string;
		name: string;
	};
	ceremony: {
		uid: string;
		number: number;
		year: number;
	};
	organization: {
		uid: string;
		name: string;
		shortName: string;
	};
};

type PosterUrl = {
	uid: string;
	url: string;
	width: number | undefined;
	height: number | undefined;
	languageCode: string | undefined;
	source: string | undefined;
	isPrimary: boolean;
};

type MovieDetails = {
	uid: string;
	year: number | undefined;
	originalLanguage: string | undefined;
	imdbId: string | undefined;
	tmdbId: number | undefined;
	translations: Translation[];
	nominations: Nomination[];
	posters: PosterUrl[]; // Note: API returns 'posters', not 'posterUrls'
};

export function meta({params}: Route.MetaArgs): Route.MetaDescriptors {
	return [
		{title: `映画の編集 - SHINE Admin`},
		{name: 'description', content: 'SHINE Admin 映画編集画面'},
	];
}

export async function loader({context, params}: Route.LoaderArgs) {
	const {id} = params;

	if (!id) {
		throw new Response('Movie ID is required', {status: 400});
	}

	return {
		apiUrl:
			(context.cloudflare as {env: {PUBLIC_API_URL?: string}}).env
				.PUBLIC_API_URL || 'http://localhost:8787',
		movieId: id,
	};
}

const handleLogout = () => {
	if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
		globalThis.localStorage.removeItem('adminToken');
		globalThis.location.href = '/admin/login';
	}
};

export default function AdminMovieEdit({loaderData}: Route.ComponentProps) {
	const {apiUrl, movieId} = loaderData as {
		apiUrl: string;
		movieId: string;
	};

	const [movieData, setMovieData] = useState<MovieDetails | undefined>(
		undefined,
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

	// Translation editing states
	const [editingTranslation, setEditingTranslation] = useState<
		string | undefined
	>(undefined);
	const [newTranslation, setNewTranslation] = useState({
		languageCode: '',
		content: '',
		isDefault: false,
	});
	const [showAddTranslation, setShowAddTranslation] = useState(false);
	const [translationError, setTranslationError] = useState<string | undefined>(
		undefined,
	);

	// IMDb ID editing states
	const [editingImdbId, setEditingImdbId] = useState(false);
	const [newImdbId, setNewImdbId] = useState('');
	const [imdbError, setImdbError] = useState<string | undefined>(undefined);
	const [fetchTmdbData, setFetchTmdbData] = useState(false);

	// TMDb ID editing states
	const [editingTmdbId, setEditingTmdbId] = useState(false);
	const [newTmdbId, setNewTmdbId] = useState('');
	const [tmdbError, setTmdbError] = useState<string | undefined>(undefined);

	// Poster management states
	const [showAddPoster, setShowAddPoster] = useState(false);
	const [newPoster, setNewPoster] = useState({
		url: '',
		width: '',
		height: '',
		languageCode: '',
		source: '',
		isPrimary: false,
	});
	const [posterError, setPosterError] = useState<string | undefined>(undefined);

	// Load movie data
	useEffect(() => {
		const loadMovie = async () => {
			if (globalThis.window === undefined) return;

			const token = globalThis.localStorage.getItem('adminToken');
			if (!token) {
				globalThis.location.href = '/admin/login';
				return;
			}

			setLoading(true);
			setError(undefined);

			try {
				const response = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
					headers: {Authorization: `Bearer ${token}`},
				});

				if (response.status === 401) {
					globalThis.localStorage.removeItem('adminToken');
					globalThis.location.href = '/admin/login';
					return;
				}

				if (!response.ok) {
					throw new Error('Failed to fetch movie data');
				}

				const data = (await response.json()) as MovieDetails;
				console.log('Raw API response:', JSON.stringify(data, undefined, 2));
				console.log('Translations:', data.translations);
				console.log('Nominations:', data.nominations);
				console.log('Posters:', data.posters);

				// Ensure required properties exist and normalize structure
				const normalizedData: MovieDetails = {
					uid: data.uid,
					year: data.year,
					originalLanguage: data.originalLanguage,
					imdbId: data.imdbId,
					tmdbId: data.tmdbId,
					translations: data.translations || [],
					nominations: data.nominations || [],
					posters: data.posters || [], // API returns 'posters'
				};

				console.log('Normalized data:', normalizedData);
				setMovieData(normalizedData);
			} catch (error) {
				console.error('Error loading movie:', error);
				setError('Failed to load movie data');
			} finally {
				setLoading(false);
			}
		};

		loadMovie();
	}, [apiUrl, movieId]);

	// Translation management functions
	const addTranslation = async () => {
		if (!newTranslation.languageCode.trim() || !newTranslation.content.trim()) {
			setTranslationError('言語コードとタイトルは必須です');
			return;
		}

		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		try {
			const response = await fetch(`${apiUrl}/movies/${movieId}/translations`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					languageCode: newTranslation.languageCode.trim(),
					content: newTranslation.content.trim(),
					isDefault: newTranslation.isDefault,
				}),
			});

			if (response.status === 401) {
				globalThis.localStorage?.removeItem('adminToken');
				globalThis.location.href = '/admin/login';
				return;
			}

			if (!response.ok) {
				const errorData = (await response
					.json()
					.catch(() => ({error: 'Unknown error'}))) as {error?: string};
				throw new Error(errorData.error || 'Failed to add translation');
			}

			// Reload movie data
			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				setMovieData(data);
			}

			// Reset form
			setNewTranslation({languageCode: '', content: '', isDefault: false});
			setShowAddTranslation(false);
			setTranslationError(undefined);

			globalThis.alert?.('翻訳を追加しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to add translation';
			setTranslationError(message);
			console.error('Add translation error:', error);
		}
	};

	const updateTranslation = async (
		translationId: string,
		languageCode: string,
		content: string,
		isDefault: boolean,
	) => {
		if (!languageCode.trim() || !content.trim()) {
			setTranslationError('言語コードとタイトルは必須です');
			return;
		}

		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		try {
			const response = await fetch(`${apiUrl}/movies/${movieId}/translations`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					languageCode: languageCode.trim(),
					content: content.trim(),
					isDefault,
				}),
			});

			if (response.status === 401) {
				globalThis.localStorage?.removeItem('adminToken');
				globalThis.location.href = '/admin/login';
				return;
			}

			if (!response.ok) {
				const errorData = (await response
					.json()
					.catch(() => ({error: 'Unknown error'}))) as {error?: string};
				throw new Error(errorData.error || 'Failed to update translation');
			}

			// Reload movie data
			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				setMovieData(data);
			}

			setEditingTranslation(undefined);
			setTranslationError(undefined);

			globalThis.alert?.('翻訳を更新しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update translation';
			setTranslationError(message);
			console.error('Update translation error:', error);
		}
	};

	const deleteTranslation = async (languageCode: string) => {
		if (!globalThis.confirm?.(`「${languageCode}」の翻訳を削除しますか？`)) {
			return;
		}

		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		try {
			const response = await fetch(
				`${apiUrl}/movies/${movieId}/translations/${languageCode}`,
				{
					method: 'DELETE',
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
				throw new Error(errorData.error || 'Failed to delete translation');
			}

			// Reload movie data
			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				setMovieData(data);
			}

			globalThis.alert?.('翻訳を削除しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to delete translation';
			globalThis.alert?.(message);
			console.error('Delete translation error:', error);
		}
	};

	// IMDb ID management function
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

			// Reload movie data
			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				setMovieData(data);
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

	// TMDb ID management function (placeholder - API endpoint may not exist yet)
	const updateTmdbId = async () => {
		const tmdbIdNumber = newTmdbId.trim()
			? Number.parseInt(newTmdbId.trim())
			: undefined;

		if (
			newTmdbId.trim() &&
			(tmdbIdNumber === undefined || isNaN(tmdbIdNumber) || tmdbIdNumber <= 0)
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
			// Note: This endpoint may not exist yet - using placeholder implementation
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

			// Reload movie data
			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				setMovieData(data);
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

	// Poster management functions
	const addPoster = async () => {
		if (!newPoster.url.trim()) {
			setPosterError('URLは必須です');
			return;
		}

		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		try {
			const response = await fetch(
				`${apiUrl}/admin/movies/${movieId}/posters`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						url: newPoster.url.trim(),
						width: newPoster.width
							? Number.parseInt(newPoster.width)
							: undefined,
						height: newPoster.height
							? Number.parseInt(newPoster.height)
							: undefined,
						languageCode: newPoster.languageCode.trim() || undefined,
						source: newPoster.source.trim() || undefined,
						isPrimary: newPoster.isPrimary,
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
				throw new Error(errorData.error || 'Failed to add poster');
			}

			// Reload movie data
			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				setMovieData(data);
			}

			// Reset form
			setNewPoster({
				url: '',
				width: '',
				height: '',
				languageCode: '',
				source: '',
				isPrimary: false,
			});
			setShowAddPoster(false);
			setPosterError(undefined);

			globalThis.alert?.('ポスターを追加しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to add poster';
			setPosterError(message);
			console.error('Add poster error:', error);
		}
	};

	const deletePoster = async (posterId: string) => {
		if (!globalThis.confirm?.('このポスターを削除しますか？')) {
			return;
		}

		const token = globalThis.localStorage?.getItem('adminToken');
		if (!token) {
			globalThis.location.href = '/admin/login';
			return;
		}

		try {
			const response = await fetch(
				`${apiUrl}/admin/movies/${movieId}/posters/${posterId}`,
				{
					method: 'DELETE',
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
				throw new Error(errorData.error || 'Failed to delete poster');
			}

			// Reload movie data
			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				setMovieData(data);
			}

			globalThis.alert?.('ポスターを削除しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to delete poster';
			globalThis.alert?.(message);
			console.error('Delete poster error:', error);
		}
	};

	if (loading) {
		return (
			<main
				style={{
					minHeight: '100vh',
					background: '#f3f4f6',
					padding: '20px 0',
				}}
			>
				<div
					style={{
						maxWidth: '800px',
						margin: '0 auto 20px',
						padding: '0 20px',
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
					}}
				>
					<h1
						style={{
							margin: 0,
							color: '#1f2937',
							fontSize: '1.875rem',
						}}
					>
						映画の編集
					</h1>
					<div style={{display: 'flex', gap: '12px'}}>
						<a
							href="/"
							style={{
								padding: '8px 16px',
								border: 'none',
								borderRadius: '4px',
								textDecoration: 'none',
								fontSize: '0.875rem',
								fontWeight: 500,
								cursor: 'pointer',
								display: 'inline-block',
								background: '#16a34a',
								color: 'white',
							}}
						>
							トップページ
						</a>
						<a
							href="/admin/movies"
							style={{
								padding: '8px 16px',
								border: 'none',
								borderRadius: '4px',
								textDecoration: 'none',
								fontSize: '0.875rem',
								fontWeight: 500,
								cursor: 'pointer',
								display: 'inline-block',
								background: '#6b7280',
								color: 'white',
							}}
						>
							← 一覧に戻る
						</a>
						<button
							onClick={handleLogout}
							style={{
								padding: '8px 16px',
								border: 'none',
								borderRadius: '4px',
								fontSize: '0.875rem',
								fontWeight: 500,
								cursor: 'pointer',
								background: '#dc2626',
								color: 'white',
							}}
						>
							ログアウト
						</button>
					</div>
				</div>
				<div
					style={{
						maxWidth: '800px',
						margin: '0 auto',
						padding: '0 20px',
					}}
				>
					<div
						style={{
							textAlign: 'center',
							background: 'white',
							borderRadius: '8px',
							boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
							padding: '3rem',
							color: '#666',
						}}
					>
						データを読み込み中...
					</div>
				</div>
			</main>
		);
	}

	if (error) {
		return (
			<main
				style={{
					minHeight: '100vh',
					background: '#f3f4f6',
					padding: '20px 0',
				}}
			>
				<div
					style={{
						maxWidth: '800px',
						margin: '0 auto 20px',
						padding: '0 20px',
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
					}}
				>
					<h1
						style={{
							margin: 0,
							color: '#1f2937',
							fontSize: '1.875rem',
						}}
					>
						映画の編集
					</h1>
					<div style={{display: 'flex', gap: '12px'}}>
						<a
							href="/"
							style={{
								padding: '8px 16px',
								border: 'none',
								borderRadius: '4px',
								textDecoration: 'none',
								fontSize: '0.875rem',
								fontWeight: 500,
								cursor: 'pointer',
								display: 'inline-block',
								background: '#16a34a',
								color: 'white',
							}}
						>
							トップページ
						</a>
						<a
							href="/admin/movies"
							style={{
								padding: '8px 16px',
								border: 'none',
								borderRadius: '4px',
								textDecoration: 'none',
								fontSize: '0.875rem',
								fontWeight: 500,
								cursor: 'pointer',
								display: 'inline-block',
								background: '#6b7280',
								color: 'white',
							}}
						>
							← 一覧に戻る
						</a>
						<button
							onClick={handleLogout}
							style={{
								padding: '8px 16px',
								border: 'none',
								borderRadius: '4px',
								fontSize: '0.875rem',
								fontWeight: 500,
								cursor: 'pointer',
								background: '#dc2626',
								color: 'white',
							}}
						>
							ログアウト
						</button>
					</div>
				</div>
				<div
					style={{
						maxWidth: '800px',
						margin: '0 auto',
						padding: '0 20px',
					}}
				>
					<div
						style={{
							textAlign: 'center',
							background: 'white',
							borderRadius: '8px',
							boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
							padding: '3rem',
							color: '#dc2626',
						}}
					>
						{error}
					</div>
				</div>
			</main>
		);
	}

	if (!movieData) {
		return (
			<main
				style={{
					minHeight: '100vh',
					background: '#f3f4f6',
					padding: '20px 0',
				}}
			>
				<div
					style={{
						maxWidth: '800px',
						margin: '0 auto',
						padding: '0 20px',
					}}
				>
					<div
						style={{
							textAlign: 'center',
							background: 'white',
							borderRadius: '8px',
							boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
							padding: '3rem',
							color: '#666',
						}}
					>
						映画が見つかりません
					</div>
				</div>
			</main>
		);
	}

	console.log('Component render - movieData:', movieData);

	const primaryTitle =
		movieData.translations?.find((t) => t.isDefault === 1)?.content ||
		movieData.translations?.find((t) => t.languageCode === 'ja')?.content ||
		movieData.translations?.[0]?.content ||
		'無題';

	console.log('Primary title:', primaryTitle);

	return (
		<main
			style={{
				minHeight: '100vh',
				background: '#f3f4f6',
				padding: '20px 0',
			}}
		>
			{/* Header */}
			<div
				style={{
					maxWidth: '800px',
					margin: '0 auto 20px',
					padding: '0 20px',
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}
			>
				<h1
					style={{
						margin: 0,
						color: '#1f2937',
						fontSize: '1.875rem',
					}}
				>
					映画の編集
				</h1>
				<div style={{display: 'flex', gap: '12px'}}>
					<a
						href="/admin/movies"
						style={{
							padding: '8px 16px',
							border: 'none',
							borderRadius: '4px',
							textDecoration: 'none',
							fontSize: '0.875rem',
							fontWeight: 500,
							cursor: 'pointer',
							display: 'inline-block',
							background: '#6b7280',
							color: 'white',
						}}
						onMouseOver={(e) => (e.currentTarget.style.background = '#4b5563')}
						onMouseOut={(e) => (e.currentTarget.style.background = '#6b7280')}
					>
						← 一覧に戻る
					</a>
					<button
						onClick={handleLogout}
						style={{
							padding: '8px 16px',
							border: 'none',
							borderRadius: '4px',
							fontSize: '0.875rem',
							fontWeight: 500,
							cursor: 'pointer',
							background: '#dc2626',
							color: 'white',
						}}
						onMouseOver={(e) => (e.currentTarget.style.background = '#b91c1c')}
						onMouseOut={(e) => (e.currentTarget.style.background = '#dc2626')}
					>
						ログアウト
					</button>
				</div>
			</div>

			{/* Editor Content */}
			<div
				style={{
					maxWidth: '800px',
					margin: '0 auto',
					padding: '0 20px',
				}}
			>
				{/* Movie Info */}
				<div
					style={{
						background: 'white',
						borderRadius: '8px',
						boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
						padding: '24px',
						marginBottom: '20px',
					}}
				>
					<h2
						style={{
							margin: '0 0 20px 0',
							color: '#1f2937',
							fontSize: '1.25rem',
							fontWeight: 600,
						}}
					>
						映画情報
					</h2>
					<h3
						style={{
							margin: '0 0 16px 0',
							color: '#1f2937',
							fontSize: '1.125rem',
							fontWeight: 500,
						}}
					>
						{primaryTitle}
					</h3>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
							gap: '16px',
						}}
					>
						<div>
							<label style={{fontWeight: 600, color: '#374151'}}>年:</label>
							<span style={{marginLeft: '8px', color: '#6b7280'}}>
								{movieData.year || 'N/A'}
							</span>
						</div>
						<div>
							<label style={{fontWeight: 600, color: '#374151'}}>原語:</label>
							<span style={{marginLeft: '8px', color: '#6b7280'}}>
								{movieData.originalLanguage || 'N/A'}
							</span>
						</div>
						<div>
							<label style={{fontWeight: 600, color: '#374151'}}>
								IMDb ID:
							</label>
							{editingImdbId ? (
								<div style={{marginTop: '8px'}}>
									<div
										style={{
											display: 'flex',
											gap: '8px',
											alignItems: 'flex-start',
											flexWrap: 'wrap',
										}}
									>
										<input
											type="text"
											value={newImdbId}
											onChange={(e) => {
												setNewImdbId(e.target.value);
											}}
											placeholder="tt1234567"
											style={{
												flex: '1',
												minWidth: '120px',
												padding: '6px 8px',
												border: '1px solid #d1d5db',
												borderRadius: '4px',
												fontSize: '0.875rem',
											}}
										/>
										<button
											onClick={updateImdbId}
											style={{
												padding: '6px 12px',
												border: 'none',
												borderRadius: '4px',
												fontSize: '0.75rem',
												cursor: 'pointer',
												background: '#059669',
												color: 'white',
											}}
											onMouseOver={(e) =>
												(e.currentTarget.style.background = '#047857')
											}
											onMouseOut={(e) =>
												(e.currentTarget.style.background = '#059669')
											}
										>
											保存
										</button>
										<button
											onClick={() => {
												setEditingImdbId(false);
												setNewImdbId('');
												setImdbError(undefined);
												setFetchTmdbData(false);
											}}
											style={{
												padding: '6px 12px',
												border: '1px solid #d1d5db',
												borderRadius: '4px',
												fontSize: '0.75rem',
												cursor: 'pointer',
												background: 'white',
												color: '#374151',
											}}
											onMouseOver={(e) =>
												(e.currentTarget.style.background = '#f3f4f6')
											}
											onMouseOut={(e) =>
												(e.currentTarget.style.background = 'white')
											}
										>
											キャンセル
										</button>
									</div>
									<label
										style={{
											display: 'flex',
											alignItems: 'center',
											marginTop: '8px',
											fontSize: '0.75rem',
											color: '#374151',
											cursor: 'pointer',
										}}
									>
										<input
											type="checkbox"
											checked={fetchTmdbData}
											onChange={(e) => {
												setFetchTmdbData(e.target.checked);
											}}
											style={{marginRight: '6px'}}
										/>
										TMDbから追加データを取得
									</label>
									{imdbError && (
										<div
											style={{
												marginTop: '8px',
												padding: '8px',
												background: '#fef2f2',
												border: '1px solid #fecaca',
												borderRadius: '4px',
												color: '#dc2626',
												fontSize: '0.75rem',
											}}
										>
											{imdbError}
										</div>
									)}
								</div>
							) : (
								<span style={{marginLeft: '8px', color: '#6b7280'}}>
									{movieData.imdbId || 'N/A'}
									<button
										onClick={() => {
											setEditingImdbId(true);
											setNewImdbId(movieData.imdbId || '');
											setImdbError(undefined);
										}}
										style={{
											marginLeft: '8px',
											padding: '2px 6px',
											border: 'none',
											borderRadius: '4px',
											fontSize: '0.75rem',
											cursor: 'pointer',
											background: '#2563eb',
											color: 'white',
										}}
										onMouseOver={(e) =>
											(e.currentTarget.style.background = '#1d4ed8')
										}
										onMouseOut={(e) =>
											(e.currentTarget.style.background = '#2563eb')
										}
									>
										編集
									</button>
								</span>
							)}
						</div>
						<div>
							<label style={{fontWeight: 600, color: '#374151'}}>
								TMDb ID:
							</label>
							{editingTmdbId ? (
								<div style={{marginTop: '8px'}}>
									<div
										style={{
											display: 'flex',
											gap: '8px',
											alignItems: 'flex-start',
											flexWrap: 'wrap',
										}}
									>
										<input
											type="text"
											value={newTmdbId}
											onChange={(e) => {
												setNewTmdbId(e.target.value);
											}}
											placeholder="123456"
											style={{
												flex: '1',
												minWidth: '120px',
												padding: '6px 8px',
												border: '1px solid #d1d5db',
												borderRadius: '4px',
												fontSize: '0.875rem',
											}}
										/>
										<button
											onClick={updateTmdbId}
											style={{
												padding: '6px 12px',
												border: 'none',
												borderRadius: '4px',
												fontSize: '0.75rem',
												cursor: 'pointer',
												background: '#059669',
												color: 'white',
											}}
											onMouseOver={(e) =>
												(e.currentTarget.style.background = '#047857')
											}
											onMouseOut={(e) =>
												(e.currentTarget.style.background = '#059669')
											}
										>
											保存
										</button>
										<button
											onClick={() => {
												setEditingTmdbId(false);
												setNewTmdbId('');
												setTmdbError(undefined);
											}}
											style={{
												padding: '6px 12px',
												border: '1px solid #d1d5db',
												borderRadius: '4px',
												fontSize: '0.75rem',
												cursor: 'pointer',
												background: 'white',
												color: '#374151',
											}}
											onMouseOver={(e) =>
												(e.currentTarget.style.background = '#f3f4f6')
											}
											onMouseOut={(e) =>
												(e.currentTarget.style.background = 'white')
											}
										>
											キャンセル
										</button>
									</div>
									{tmdbError && (
										<div
											style={{
												marginTop: '8px',
												padding: '8px',
												background: '#fef2f2',
												border: '1px solid #fecaca',
												borderRadius: '4px',
												color: '#dc2626',
												fontSize: '0.75rem',
											}}
										>
											{tmdbError}
										</div>
									)}
								</div>
							) : (
								<span style={{marginLeft: '8px', color: '#6b7280'}}>
									{movieData.tmdbId || 'N/A'}
									<button
										onClick={() => {
											setEditingTmdbId(true);
											setNewTmdbId(movieData.tmdbId?.toString() || '');
											setTmdbError(undefined);
										}}
										style={{
											marginLeft: '8px',
											padding: '2px 6px',
											border: 'none',
											borderRadius: '4px',
											fontSize: '0.75rem',
											cursor: 'pointer',
											background: '#2563eb',
											color: 'white',
										}}
										onMouseOver={(e) =>
											(e.currentTarget.style.background = '#1d4ed8')
										}
										onMouseOut={(e) =>
											(e.currentTarget.style.background = '#2563eb')
										}
									>
										編集
									</button>
								</span>
							)}
						</div>
					</div>
				</div>

				{/* Translations */}
				<div
					style={{
						background: 'white',
						borderRadius: '8px',
						boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
						padding: '24px',
						marginBottom: '20px',
					}}
				>
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							marginBottom: '20px',
						}}
					>
						<h3
							style={{
								margin: 0,
								color: '#1f2937',
								fontSize: '1.125rem',
								fontWeight: 600,
							}}
						>
							翻訳管理
						</h3>
						<button
							onClick={() => {
								setShowAddTranslation(!showAddTranslation);
								setTranslationError(undefined);
							}}
							style={{
								padding: '8px 16px',
								border: 'none',
								borderRadius: '4px',
								fontSize: '0.875rem',
								fontWeight: 500,
								cursor: 'pointer',
								background: '#059669',
								color: 'white',
							}}
							onMouseOver={(e) =>
								(e.currentTarget.style.background = '#047857')
							}
							onMouseOut={(e) => (e.currentTarget.style.background = '#059669')}
						>
							{showAddTranslation ? 'キャンセル' : '+ 翻訳を追加'}
						</button>
					</div>

					{/* Translation Error */}
					{translationError && (
						<div
							style={{
								background: '#fef2f2',
								border: '1px solid #fecaca',
								borderRadius: '4px',
								padding: '12px',
								marginBottom: '16px',
								color: '#dc2626',
							}}
						>
							{translationError}
						</div>
					)}

					{/* Add Translation Form */}
					{showAddTranslation && (
						<div
							style={{
								border: '1px solid #e5e7eb',
								borderRadius: '8px',
								padding: '20px',
								marginBottom: '20px',
								background: '#f9fafb',
							}}
						>
							<h4
								style={{
									margin: '0 0 16px 0',
									color: '#1f2937',
									fontSize: '1rem',
									fontWeight: 600,
								}}
							>
								新しい翻訳を追加
							</h4>
							<div
								style={{
									display: 'grid',
									gridTemplateColumns: '120px 1fr 100px',
									gap: '12px',
									alignItems: 'end',
								}}
							>
								<div>
									<label
										style={{
											display: 'block',
											marginBottom: '4px',
											fontSize: '0.875rem',
											fontWeight: 500,
											color: '#374151',
										}}
									>
										言語コード
									</label>
									<input
										type="text"
										value={newTranslation.languageCode}
										onChange={(e) => {
											setNewTranslation((previous) => ({
												...previous,
												languageCode: e.target.value,
											}));
										}}
										placeholder="ja, en, etc."
										style={{
											width: '100%',
											padding: '8px 12px',
											border: '1px solid #d1d5db',
											borderRadius: '4px',
											fontSize: '0.875rem',
										}}
									/>
								</div>
								<div>
									<label
										style={{
											display: 'block',
											marginBottom: '4px',
											fontSize: '0.875rem',
											fontWeight: 500,
											color: '#374151',
										}}
									>
										タイトル
									</label>
									<input
										type="text"
										value={newTranslation.content}
										onChange={(e) => {
											setNewTranslation((previous) => ({
												...previous,
												content: e.target.value,
											}));
										}}
										placeholder="映画のタイトル"
										style={{
											width: '100%',
											padding: '8px 12px',
											border: '1px solid #d1d5db',
											borderRadius: '4px',
											fontSize: '0.875rem',
										}}
									/>
								</div>
								<div>
									<label
										style={{
											display: 'flex',
											alignItems: 'center',
											fontSize: '0.875rem',
											color: '#374151',
											cursor: 'pointer',
										}}
									>
										<input
											type="checkbox"
											checked={newTranslation.isDefault}
											onChange={(e) => {
												setNewTranslation((previous) => ({
													...previous,
													isDefault: e.target.checked,
												}));
											}}
											style={{
												marginRight: '6px',
											}}
										/>
										デフォルト
									</label>
								</div>
							</div>
							<div
								style={{
									display: 'flex',
									gap: '8px',
									marginTop: '16px',
								}}
							>
								<button
									onClick={addTranslation}
									style={{
										padding: '8px 16px',
										border: 'none',
										borderRadius: '4px',
										fontSize: '0.875rem',
										fontWeight: 500,
										cursor: 'pointer',
										background: '#2563eb',
										color: 'white',
									}}
									onMouseOver={(e) =>
										(e.currentTarget.style.background = '#1d4ed8')
									}
									onMouseOut={(e) =>
										(e.currentTarget.style.background = '#2563eb')
									}
								>
									追加
								</button>
								<button
									onClick={() => {
										setShowAddTranslation(false);
										setNewTranslation({
											languageCode: '',
											content: '',
											isDefault: false,
										});
										setTranslationError(undefined);
									}}
									style={{
										padding: '8px 16px',
										border: '1px solid #d1d5db',
										borderRadius: '4px',
										fontSize: '0.875rem',
										fontWeight: 500,
										cursor: 'pointer',
										background: 'white',
										color: '#374151',
									}}
									onMouseOver={(e) =>
										(e.currentTarget.style.background = '#f3f4f6')
									}
									onMouseOut={(e) =>
										(e.currentTarget.style.background = 'white')
									}
								>
									キャンセル
								</button>
							</div>
						</div>
					)}

					{!movieData.translations || movieData.translations.length === 0 ? (
						<p style={{color: '#6b7280', fontStyle: 'italic'}}>
							翻訳がありません
						</p>
					) : (
						<div
							style={{
								border: '1px solid #e5e7eb',
								borderRadius: '8px',
								overflow: 'hidden',
							}}
						>
							<table
								style={{
									width: '100%',
									borderCollapse: 'collapse',
								}}
							>
								<thead>
									<tr style={{background: '#f9fafb'}}>
										<th
											style={{
												padding: '12px',
												textAlign: 'left',
												fontWeight: 600,
												color: '#374151',
												borderBottom: '1px solid #e5e7eb',
											}}
										>
											言語
										</th>
										<th
											style={{
												padding: '12px',
												textAlign: 'left',
												fontWeight: 600,
												color: '#374151',
												borderBottom: '1px solid #e5e7eb',
											}}
										>
											タイトル
										</th>
										<th
											style={{
												padding: '12px',
												textAlign: 'left',
												fontWeight: 600,
												color: '#374151',
												borderBottom: '1px solid #e5e7eb',
											}}
										>
											デフォルト
										</th>
										<th
											style={{
												padding: '12px',
												textAlign: 'left',
												fontWeight: 600,
												color: '#374151',
												borderBottom: '1px solid #e5e7eb',
											}}
										>
											操作
										</th>
									</tr>
								</thead>
								<tbody>
									{movieData.translations?.map((translation) => (
										<tr key={translation.uid}>
											<td
												style={{
													padding: '12px',
													borderBottom: '1px solid #e5e7eb',
												}}
											>
												{editingTranslation === translation.uid ? (
													<input
														type="text"
														defaultValue={translation.languageCode}
														id={`lang-${translation.uid}`}
														style={{
															width: '80px',
															padding: '4px 8px',
															border: '1px solid #d1d5db',
															borderRadius: '4px',
															fontSize: '0.875rem',
														}}
													/>
												) : (
													translation.languageCode
												)}
											</td>
											<td
												style={{
													padding: '12px',
													borderBottom: '1px solid #e5e7eb',
												}}
											>
												{editingTranslation === translation.uid ? (
													<input
														type="text"
														defaultValue={translation.content}
														id={`content-${translation.uid}`}
														style={{
															width: '100%',
															padding: '4px 8px',
															border: '1px solid #d1d5db',
															borderRadius: '4px',
															fontSize: '0.875rem',
														}}
													/>
												) : (
													translation.content
												)}
											</td>
											<td
												style={{
													padding: '12px',
													borderBottom: '1px solid #e5e7eb',
												}}
											>
												{editingTranslation === translation.uid ? (
													<label
														style={{
															display: 'flex',
															alignItems: 'center',
															fontSize: '0.875rem',
															cursor: 'pointer',
														}}
													>
														<input
															type="checkbox"
															defaultChecked={translation.isDefault === 1}
															id={`default-${translation.uid}`}
															style={{marginRight: '6px'}}
														/>
														デフォルト
													</label>
												) : (
													translation.isDefault === 1 && (
														<span
															style={{
																background: '#dcfce7',
																color: '#166534',
																padding: '2px 8px',
																borderRadius: '4px',
																fontSize: '0.875rem',
															}}
														>
															デフォルト
														</span>
													)
												)}
											</td>
											<td
												style={{
													padding: '12px',
													borderBottom: '1px solid #e5e7eb',
												}}
											>
												{editingTranslation === translation.uid ? (
													<div style={{display: 'flex', gap: '4px'}}>
														<button
															onClick={() => {
																const langInput = document.getElementById(
																	`lang-${translation.uid}`,
																) as HTMLInputElement;
																const contentInput = document.getElementById(
																	`content-${translation.uid}`,
																) as HTMLInputElement;
																const defaultInput = document.getElementById(
																	`default-${translation.uid}`,
																) as HTMLInputElement;

																updateTranslation(
																	translation.uid,
																	langInput.value,
																	contentInput.value,
																	defaultInput.checked,
																);
															}}
															style={{
																padding: '4px 8px',
																border: 'none',
																borderRadius: '4px',
																fontSize: '0.75rem',
																cursor: 'pointer',
																background: '#059669',
																color: 'white',
															}}
															onMouseOver={(e) =>
																(e.currentTarget.style.background = '#047857')
															}
															onMouseOut={(e) =>
																(e.currentTarget.style.background = '#059669')
															}
														>
															保存
														</button>
														<button
															onClick={() => {
																setEditingTranslation(undefined);
																setTranslationError(undefined);
															}}
															style={{
																padding: '4px 8px',
																border: '1px solid #d1d5db',
																borderRadius: '4px',
																fontSize: '0.75rem',
																cursor: 'pointer',
																background: 'white',
																color: '#374151',
															}}
															onMouseOver={(e) =>
																(e.currentTarget.style.background = '#f3f4f6')
															}
															onMouseOut={(e) =>
																(e.currentTarget.style.background = 'white')
															}
														>
															Cancel
														</button>
													</div>
												) : (
													<div style={{display: 'flex', gap: '4px'}}>
														<button
															onClick={() => {
																setEditingTranslation(translation.uid);
																setTranslationError(undefined);
															}}
															style={{
																padding: '4px 8px',
																border: 'none',
																borderRadius: '4px',
																fontSize: '0.75rem',
																cursor: 'pointer',
																background: '#2563eb',
																color: 'white',
															}}
															onMouseOver={(e) =>
																(e.currentTarget.style.background = '#1d4ed8')
															}
															onMouseOut={(e) =>
																(e.currentTarget.style.background = '#2563eb')
															}
														>
															編集
														</button>
														<button
															onClick={async () =>
																deleteTranslation(translation.languageCode)
															}
															style={{
																padding: '4px 8px',
																border: 'none',
																borderRadius: '4px',
																fontSize: '0.75rem',
																cursor: 'pointer',
																background: '#dc2626',
																color: 'white',
															}}
															onMouseOver={(e) =>
																(e.currentTarget.style.background = '#b91c1c')
															}
															onMouseOut={(e) =>
																(e.currentTarget.style.background = '#dc2626')
															}
														>
															削除
														</button>
													</div>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>

				{/* Nominations */}
				<div
					style={{
						background: 'white',
						borderRadius: '8px',
						boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
						padding: '24px',
						marginBottom: '20px',
					}}
				>
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							marginBottom: '20px',
						}}
					>
						<h3
							style={{
								margin: 0,
								color: '#1f2937',
								fontSize: '1.125rem',
								fontWeight: 600,
							}}
						>
							ノミネート管理
						</h3>
					</div>
					{!movieData.nominations || movieData.nominations.length === 0 ? (
						<p style={{color: '#6b7280', fontStyle: 'italic'}}>
							ノミネートがありません
						</p>
					) : (
						<div
							style={{
								border: '1px solid #e5e7eb',
								borderRadius: '8px',
								overflow: 'hidden',
							}}
						>
							<table
								style={{
									width: '100%',
									borderCollapse: 'collapse',
								}}
							>
								<thead>
									<tr style={{background: '#f9fafb'}}>
										<th
											style={{
												padding: '12px',
												textAlign: 'left',
												fontWeight: 600,
												color: '#374151',
												borderBottom: '1px solid #e5e7eb',
											}}
										>
											団体
										</th>
										<th
											style={{
												padding: '12px',
												textAlign: 'left',
												fontWeight: 600,
												color: '#374151',
												borderBottom: '1px solid #e5e7eb',
											}}
										>
											年度
										</th>
										<th
											style={{
												padding: '12px',
												textAlign: 'left',
												fontWeight: 600,
												color: '#374151',
												borderBottom: '1px solid #e5e7eb',
											}}
										>
											カテゴリ
										</th>
										<th
											style={{
												padding: '12px',
												textAlign: 'left',
												fontWeight: 600,
												color: '#374151',
												borderBottom: '1px solid #e5e7eb',
											}}
										>
											結果
										</th>
									</tr>
								</thead>
								<tbody>
									{movieData.nominations?.map((nomination) => (
										<tr key={nomination.uid}>
											<td
												style={{
													padding: '12px',
													borderBottom: '1px solid #e5e7eb',
												}}
											>
												{nomination.organization.name}
											</td>
											<td
												style={{
													padding: '12px',
													borderBottom: '1px solid #e5e7eb',
												}}
											>
												{nomination.ceremony.year}
											</td>
											<td
												style={{
													padding: '12px',
													borderBottom: '1px solid #e5e7eb',
												}}
											>
												{nomination.category.name}
											</td>
											<td
												style={{
													padding: '12px',
													borderBottom: '1px solid #e5e7eb',
												}}
											>
												{nomination.isWinner ? (
													<span
														style={{
															background: '#fef3c7',
															color: '#92400e',
															padding: '2px 8px',
															borderRadius: '4px',
															fontSize: '0.875rem',
														}}
													>
														受賞
													</span>
												) : (
													<span
														style={{
															background: '#f3f4f6',
															color: '#6b7280',
															padding: '2px 8px',
															borderRadius: '4px',
															fontSize: '0.875rem',
														}}
													>
														ノミネート
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>

				{/* Posters */}
				<div
					style={{
						background: 'white',
						borderRadius: '8px',
						boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
						padding: '24px',
						marginBottom: '20px',
					}}
				>
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							marginBottom: '20px',
						}}
					>
						<h3
							style={{
								margin: 0,
								color: '#1f2937',
								fontSize: '1.125rem',
								fontWeight: 600,
							}}
						>
							ポスター管理
						</h3>
						<button
							onClick={() => {
								setShowAddPoster(!showAddPoster);
								setPosterError(undefined);
							}}
							style={{
								padding: '8px 16px',
								border: 'none',
								borderRadius: '4px',
								fontSize: '0.875rem',
								fontWeight: 500,
								cursor: 'pointer',
								background: '#059669',
								color: 'white',
							}}
							onMouseOver={(e) =>
								(e.currentTarget.style.background = '#047857')
							}
							onMouseOut={(e) => (e.currentTarget.style.background = '#059669')}
						>
							{showAddPoster ? 'キャンセル' : '+ ポスターを追加'}
						</button>
					</div>

					{/* Poster Error */}
					{posterError && (
						<div
							style={{
								background: '#fef2f2',
								border: '1px solid #fecaca',
								borderRadius: '4px',
								padding: '12px',
								marginBottom: '16px',
								color: '#dc2626',
							}}
						>
							{posterError}
						</div>
					)}

					{/* Add Poster Form */}
					{showAddPoster && (
						<div
							style={{
								border: '1px solid #e5e7eb',
								borderRadius: '8px',
								padding: '20px',
								marginBottom: '20px',
								background: '#f9fafb',
							}}
						>
							<h4
								style={{
									margin: '0 0 16px 0',
									color: '#1f2937',
									fontSize: '1rem',
									fontWeight: 600,
								}}
							>
								新しいポスターを追加
							</h4>
							<div
								style={{
									display: 'grid',
									gridTemplateColumns: '1fr 100px 100px 120px 120px',
									gap: '12px',
									marginBottom: '12px',
								}}
							>
								<div>
									<label
										style={{
											display: 'block',
											marginBottom: '4px',
											fontSize: '0.875rem',
											fontWeight: 500,
											color: '#374151',
										}}
									>
										URL *
									</label>
									<input
										type="url"
										value={newPoster.url}
										onChange={(e) => {
											setNewPoster((previous) => ({
												...previous,
												url: e.target.value,
											}));
										}}
										placeholder="https://example.com/poster.jpg"
										style={{
											width: '100%',
											padding: '8px 12px',
											border: '1px solid #d1d5db',
											borderRadius: '4px',
											fontSize: '0.875rem',
										}}
									/>
								</div>
								<div>
									<label
										style={{
											display: 'block',
											marginBottom: '4px',
											fontSize: '0.875rem',
											fontWeight: 500,
											color: '#374151',
										}}
									>
										幅
									</label>
									<input
										type="number"
										value={newPoster.width}
										onChange={(e) => {
											setNewPoster((previous) => ({
												...previous,
												width: e.target.value,
											}));
										}}
										placeholder="300"
										style={{
											width: '100%',
											padding: '8px 12px',
											border: '1px solid #d1d5db',
											borderRadius: '4px',
											fontSize: '0.875rem',
										}}
									/>
								</div>
								<div>
									<label
										style={{
											display: 'block',
											marginBottom: '4px',
											fontSize: '0.875rem',
											fontWeight: 500,
											color: '#374151',
										}}
									>
										高さ
									</label>
									<input
										type="number"
										value={newPoster.height}
										onChange={(e) => {
											setNewPoster((previous) => ({
												...previous,
												height: e.target.value,
											}));
										}}
										placeholder="450"
										style={{
											width: '100%',
											padding: '8px 12px',
											border: '1px solid #d1d5db',
											borderRadius: '4px',
											fontSize: '0.875rem',
										}}
									/>
								</div>
								<div>
									<label
										style={{
											display: 'block',
											marginBottom: '4px',
											fontSize: '0.875rem',
											fontWeight: 500,
											color: '#374151',
										}}
									>
										言語
									</label>
									<input
										type="text"
										value={newPoster.languageCode}
										onChange={(e) => {
											setNewPoster((previous) => ({
												...previous,
												languageCode: e.target.value,
											}));
										}}
										placeholder="ja, en, etc."
										style={{
											width: '100%',
											padding: '8px 12px',
											border: '1px solid #d1d5db',
											borderRadius: '4px',
											fontSize: '0.875rem',
										}}
									/>
								</div>
								<div>
									<label
										style={{
											display: 'block',
											marginBottom: '4px',
											fontSize: '0.875rem',
											fontWeight: 500,
											color: '#374151',
										}}
									>
										ソース
									</label>
									<input
										type="text"
										value={newPoster.source}
										onChange={(e) => {
											setNewPoster((previous) => ({
												...previous,
												source: e.target.value,
											}));
										}}
										placeholder="TMDb, IMDb, etc."
										style={{
											width: '100%',
											padding: '8px 12px',
											border: '1px solid #d1d5db',
											borderRadius: '4px',
											fontSize: '0.875rem',
										}}
									/>
								</div>
							</div>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									marginBottom: '16px',
								}}
							>
								<label
									style={{
										display: 'flex',
										alignItems: 'center',
										fontSize: '0.875rem',
										color: '#374151',
										cursor: 'pointer',
									}}
								>
									<input
										type="checkbox"
										checked={newPoster.isPrimary}
										onChange={(e) => {
											setNewPoster((previous) => ({
												...previous,
												isPrimary: e.target.checked,
											}));
										}}
										style={{marginRight: '6px'}}
									/>
									プライマリポスターにする
								</label>
							</div>
							<div
								style={{
									display: 'flex',
									gap: '8px',
								}}
							>
								<button
									onClick={addPoster}
									style={{
										padding: '8px 16px',
										border: 'none',
										borderRadius: '4px',
										fontSize: '0.875rem',
										fontWeight: 500,
										cursor: 'pointer',
										background: '#2563eb',
										color: 'white',
									}}
									onMouseOver={(e) =>
										(e.currentTarget.style.background = '#1d4ed8')
									}
									onMouseOut={(e) =>
										(e.currentTarget.style.background = '#2563eb')
									}
								>
									追加
								</button>
								<button
									onClick={() => {
										setShowAddPoster(false);
										setNewPoster({
											url: '',
											width: '',
											height: '',
											languageCode: '',
											source: '',
											isPrimary: false,
										});
										setPosterError(undefined);
									}}
									style={{
										padding: '8px 16px',
										border: '1px solid #d1d5db',
										borderRadius: '4px',
										fontSize: '0.875rem',
										fontWeight: 500,
										cursor: 'pointer',
										background: 'white',
										color: '#374151',
									}}
									onMouseOver={(e) =>
										(e.currentTarget.style.background = '#f3f4f6')
									}
									onMouseOut={(e) =>
										(e.currentTarget.style.background = 'white')
									}
								>
									キャンセル
								</button>
							</div>
						</div>
					)}

					{!movieData.posters || movieData.posters.length === 0 ? (
						<p style={{color: '#6b7280', fontStyle: 'italic'}}>
							ポスターがありません
						</p>
					) : (
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
								gap: '16px',
							}}
						>
							{movieData.posters?.map((poster: PosterUrl) => (
								<div
									key={poster.uid}
									style={{
										border: '1px solid #e5e7eb',
										borderRadius: '8px',
										overflow: 'hidden',
										background: 'white',
									}}
								>
									<img
										src={poster.url}
										alt="Movie poster"
										style={{
											width: '100%',
											height: '200px',
											objectFit: 'cover',
										}}
									/>
									<div
										style={{
											padding: '8px',
										}}
									>
										<div
											style={{
												display: 'flex',
												justifyContent: 'space-between',
												alignItems: 'center',
												marginBottom: '4px',
											}}
										>
											{poster.isPrimary && (
												<span
													style={{
														background: '#dcfce7',
														color: '#166534',
														padding: '2px 6px',
														borderRadius: '4px',
														fontSize: '0.75rem',
														fontWeight: 500,
													}}
												>
													プライマリ
												</span>
											)}
											<button
												onClick={async () => deletePoster(poster.uid)}
												style={{
													padding: '2px 4px',
													border: 'none',
													borderRadius: '4px',
													fontSize: '0.75rem',
													cursor: 'pointer',
													background: '#dc2626',
													color: 'white',
												}}
												onMouseOver={(e) =>
													(e.currentTarget.style.background = '#b91c1c')
												}
												onMouseOut={(e) =>
													(e.currentTarget.style.background = '#dc2626')
												}
											>
												×
											</button>
										</div>
										{poster.languageCode && (
											<div
												style={{
													fontSize: '0.75rem',
													color: '#6b7280',
													marginTop: '4px',
												}}
											>
												言語: {poster.languageCode}
											</div>
										)}
										{poster.source && (
											<div
												style={{
													fontSize: '0.75rem',
													color: '#6b7280',
													marginTop: '2px',
												}}
											>
												ソース: {poster.source}
											</div>
										)}
										{(poster.width || poster.height) && (
											<div
												style={{
													fontSize: '0.75rem',
													color: '#6b7280',
													marginTop: '2px',
												}}
											>
												{poster.width && poster.height
													? `${poster.width}x${poster.height}`
													: poster.width
														? `幅: ${poster.width}`
														: poster.height
															? `高: ${poster.height}`
															: ''}
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</main>
	);
}
