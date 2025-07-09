import {useCallback, useEffect, useState, useRef, memo} from 'react';
import {useNavigate, useSearchParams} from 'react-router';
import type {Route} from './+types/admin.movies';

type Movie = {
	uid: string;
	title: string;
	year: number | undefined;
	originalLanguage: string | undefined;
	posterUrl: string | undefined;
	imdbUrl?: string;
};

type PaginationData = {
	page: number;
	limit: number;
	totalCount: number;
	totalPages: number;
};

type MoviesResponse = {
	movies: Movie[];
	pagination: PaginationData;
};

export function meta({data: _data}: Route.MetaArgs): Route.MetaDescriptors {
	return [
		{title: '映画管理 | SHINE Admin'},
		{name: 'description', content: '映画データベースの管理画面'},
	];
}

export async function loader({context, request}: Route.LoaderArgs) {
	// 認証チェックはクライアントサイドで行う
	const url = new URL(request.url);
	const page = url.searchParams.get('page') || '1';
	const limit = url.searchParams.get('limit') || '20';
	const search = url.searchParams.get('search') || '';

	return {
		apiUrl:
			(context.cloudflare as any)?.env?.PUBLIC_API_URL ||
			'http://localhost:8787',
		page: Number.parseInt(page),
		limit: Number.parseInt(limit),
		search,
		movies: [],
		pagination: {page: 1, limit: 20, totalCount: 0, totalPages: 0},
	};
}

// Simple search input component
const SearchInput = memo(
	({
		initialValue,
		onSearchChange,
	}: {
		initialValue: string;
		onSearchChange: (query: string) => void;
	}) => {
		const [localValue, setLocalValue] = useState(initialValue);
		const timeoutRef = useRef<number | undefined>(undefined);

		// Cleanup timeout on unmount
		useEffect(() => {
			return () => {
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}
			};
		}, []);

		const handleChange = useCallback(
			(e: React.ChangeEvent<HTMLInputElement>) => {
				const newValue = e.target.value;
				setLocalValue(newValue);

				// Clear existing timeout
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}

				// Set new timeout for debounced search
				timeoutRef.current = setTimeout(() => {
					onSearchChange(newValue);
				}, 300) as unknown as number;
			},
			[onSearchChange],
		);

		const handleClear = useCallback(() => {
			setLocalValue('');
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}

			onSearchChange('');
		}, [onSearchChange]);

		return (
			<div style={{marginBottom: '2rem'}}>
				<div style={{position: 'relative', maxWidth: '400px'}}>
					<input
						type="text"
						value={localValue}
						onChange={handleChange}
						placeholder="Search movies by title..."
						style={{
							width: '100%',
							padding: '0.75rem 2.5rem 0.75rem 1rem',
							border: '1px solid #e5e7eb',
							borderRadius: '8px',
							fontSize: '1rem',
							background: 'white',
							boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
						}}
					/>
					{localValue && (
						<button
							onClick={handleClear}
							style={{
								position: 'absolute',
								right: '0.75rem',
								top: '50%',
								transform: 'translateY(-50%)',
								background: 'none',
								border: 'none',
								color: '#6b7280',
								cursor: 'pointer',
								fontSize: '1rem',
								padding: '0.25rem',
								borderRadius: '50%',
								width: '1.5rem',
								height: '1.5rem',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							✕
						</button>
					)}
				</div>
			</div>
		);
	},
);

SearchInput.displayName = 'SearchInput';

// Memoized movies list component to prevent re-renders
const MoviesList = memo(
	({
		movies,
		onDelete,
		onMerge,
	}: {
		movies: Movie[];
		onDelete: (movieId: string, movieTitle: string) => void;
		onMerge: (sourceId: string, sourceTitle: string) => void;
	}) => {
		if (movies.length === 0) {
			return (
				<div
					style={{
						textAlign: 'center',
						padding: '3rem',
						color: '#666',
					}}
				>
					No movies found
				</div>
			);
		}

		return (
			<table
				style={{
					width: '100%',
					borderCollapse: 'collapse',
				}}
			>
				<thead>
					<tr>
						<th
							style={{
								background: '#f3f4f6',
								padding: '1rem',
								textAlign: 'left',
								fontWeight: 600,
								color: '#374151',
								borderBottom: '1px solid #e5e7eb',
							}}
						>
							Poster
						</th>
						<th
							style={{
								background: '#f3f4f6',
								padding: '1rem',
								textAlign: 'left',
								fontWeight: 600,
								color: '#374151',
								borderBottom: '1px solid #e5e7eb',
							}}
						>
							Title
						</th>
						<th
							style={{
								background: '#f3f4f6',
								padding: '1rem',
								textAlign: 'left',
								fontWeight: 600,
								color: '#374151',
								borderBottom: '1px solid #e5e7eb',
							}}
						>
							Year
						</th>
						<th
							style={{
								background: '#f3f4f6',
								padding: '1rem',
								textAlign: 'left',
								fontWeight: 600,
								color: '#374151',
								borderBottom: '1px solid #e5e7eb',
							}}
						>
							Language
						</th>
						<th
							style={{
								background: '#f3f4f6',
								padding: '1rem',
								textAlign: 'left',
								fontWeight: 600,
								color: '#374151',
								borderBottom: '1px solid #e5e7eb',
							}}
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody>
					{movies.map((movie) => (
						<tr
							key={movie.uid}
							style={{
								transition: 'background-color 0.2s',
							}}
							onMouseOver={(e) =>
								(e.currentTarget.style.background = '#f9fafb')
							}
							onMouseOut={(e) =>
								(e.currentTarget.style.background = 'transparent')
							}
						>
							<td
								style={{
									padding: '1rem',
									borderBottom: '1px solid #e5e7eb',
								}}
							>
								{movie.posterUrl ? (
									<img
										src={movie.posterUrl}
										alt={movie.title}
										style={{
											width: '50px',
											height: '75px',
											objectFit: 'cover',
											borderRadius: '4px',
										}}
									/>
								) : (
									<div
										style={{
											width: '50px',
											height: '75px',
											background: '#e5e7eb',
											borderRadius: '4px',
										}}
									/>
								)}
							</td>
							<td
								style={{
									padding: '1rem',
									borderBottom: '1px solid #e5e7eb',
								}}
							>
								<div
									style={{
										fontWeight: 500,
										color: '#111827',
									}}
								>
									{movie.title}
								</div>
							</td>
							<td
								style={{
									padding: '1rem',
									borderBottom: '1px solid #e5e7eb',
									color: '#6b7280',
								}}
							>
								{movie.year || 'N/A'}
							</td>
							<td
								style={{
									padding: '1rem',
									borderBottom: '1px solid #e5e7eb',
								}}
							>
								{movie.originalLanguage || 'N/A'}
							</td>
							<td
								style={{
									padding: '1rem',
									borderBottom: '1px solid #e5e7eb',
								}}
							>
								<div style={{display: 'flex', gap: '0.5rem'}}>
									<a
										href={`/admin/movies/${movie.uid}`}
										style={{
											padding: '0.375rem 0.75rem',
											border: 'none',
											borderRadius: '4px',
											cursor: 'pointer',
											fontSize: '0.875rem',
											textDecoration: 'none',
											display: 'inline-block',
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
										Edit
									</a>
									{movie.imdbUrl && (
										<a
											href={movie.imdbUrl}
											target="_blank"
											rel="noopener noreferrer"
											style={{
												padding: '0.375rem 0.75rem',
												border: 'none',
												borderRadius: '4px',
												cursor: 'pointer',
												fontSize: '0.875rem',
												textDecoration: 'none',
												display: 'inline-block',
												background: '#6b7280',
												color: 'white',
											}}
											onMouseOver={(e) =>
												(e.currentTarget.style.background = '#4b5563')
											}
											onMouseOut={(e) =>
												(e.currentTarget.style.background = '#6b7280')
											}
										>
											IMDb
										</a>
									)}
									<button
										onClick={() => onDelete(movie.uid, movie.title)}
										style={{
											padding: '0.375rem 0.75rem',
											border: 'none',
											borderRadius: '4px',
											cursor: 'pointer',
											fontSize: '0.875rem',
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
										Delete
									</button>
									<button
										onClick={() => onMerge(movie.uid, movie.title)}
										style={{
											padding: '0.375rem 0.75rem',
											border: 'none',
											borderRadius: '4px',
											cursor: 'pointer',
											fontSize: '0.875rem',
											background: '#6b7280',
											color: 'white',
										}}
										onMouseOver={(e) =>
											(e.currentTarget.style.background = '#4b5563')
										}
										onMouseOut={(e) =>
											(e.currentTarget.style.background = '#6b7280')
										}
									>
										Merge
									</button>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		);
	},
);

MoviesList.displayName = 'MoviesList';

const handleLogout = () => {
	if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
		globalThis.localStorage.removeItem('adminToken');
		globalThis.location.href = '/admin/login';
	}
};

const deleteMovie = async (
	movieId: string,
	movieTitle: string,
	apiUrl: string,
) => {
	if (
		!globalThis.confirm?.(
			`Are you sure you want to delete "${movieTitle}"? This action cannot be undone.`,
		)
	) {
		return false;
	}

	const token = globalThis.localStorage?.getItem('adminToken');
	if (!token) return false;

	try {
		const response = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (response.status === 401) {
			globalThis.localStorage?.removeItem('adminToken');
			globalThis.location.href = '/admin/login';
			return false;
		}

		if (!response.ok) {
			throw new Error('Failed to delete movie');
		}

		alert(`Movie "${movieTitle}" has been deleted successfully.`);
		return true;
	} catch (error) {
		alert('Failed to delete movie. Please try again.');
		console.error('Delete error:', error);
		return false;
	}
};

const showMergeDialog = (sourceId: string, sourceTitle: string) => {
	const targetId = globalThis.prompt?.(
		`映画「${sourceTitle}」を他の映画にマージします。\n\nマージ先の映画IDを入力してください：`,
	);

	if (targetId && targetId.trim()) {
		const confirmed = globalThis.confirm?.(
			`確認：\n\n` +
				`マージ元: ${sourceTitle} (${sourceId})\n` +
				`マージ先: ${targetId.trim()}\n\n` +
				`マージ元の映画とそのデータは削除されます。\n` +
				`この操作は取り消せません。\n\n` +
				`続行しますか？`,
		);

		if (confirmed) {
			return targetId.trim();
		}
	}

	return undefined;
};

const mergeMovies = async (
	sourceId: string,
	targetId: string,
	sourceTitle: string,
	apiUrl: string,
) => {
	const token = globalThis.localStorage?.getItem('adminToken');
	if (!token) return false;

	try {
		const response = await fetch(
			`${apiUrl}/admin/movies/${sourceId}/merge/${targetId}`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
			},
		);

		if (!response.ok) {
			const errorData = (await response.json()) as {error?: string};
			throw new Error(
				errorData.error || `HTTP error! status: ${response.status}`,
			);
		}

		alert(`Movie "${sourceTitle}" has been successfully merged.`);
		return true;
	} catch (error) {
		alert(
			`Failed to merge movie: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
		console.error('Merge error:', error);
		return false;
	}
};

export default function AdminMovies({loaderData}: Route.ComponentProps) {
	const {apiUrl} = loaderData as {
		apiUrl: string;
		page: number;
		limit: number;
		search: string;
		movies: Movie[];
		pagination: PaginationData;
	};

	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	// Get current search and page from URL params
	const currentSearch = searchParams.get('search') || '';
	const currentPage = Number(searchParams.get('page') || 1);
	const limit = Number(searchParams.get('limit') || 20);

	const [movies, setMovies] = useState<Movie[]>([]);
	const [pagination, setPagination] = useState<PaginationData>({
		page: 1,
		limit: 20,
		totalCount: 0,
		totalPages: 0,
	});
	const [loading, setLoading] = useState(true);

	// Movies fetch function
	const fetchMovies = useCallback(
		async (targetPage = currentPage, targetSearch = currentSearch) => {
			if (globalThis.window === undefined) return;

			const token = globalThis.localStorage.getItem('adminToken');
			if (!token) {
				globalThis.location.href = '/admin/login';
				return;
			}

			setLoading(true);

			try {
				const searchParameter = targetSearch
					? `&search=${encodeURIComponent(targetSearch)}`
					: '';
				const response = await fetch(
					`${apiUrl}/admin/movies?page=${targetPage}&limit=${limit}${searchParameter}`,
					{
						headers: {Authorization: `Bearer ${token}`},
					},
				);

				if (response.status === 401) {
					globalThis.localStorage.removeItem('adminToken');
					globalThis.location.href = '/admin/login';
					return;
				}

				if (!response.ok) {
					throw new Error('Failed to fetch movies');
				}

				const data = (await response.json()) as MoviesResponse;
				setMovies(data.movies || []);
				setPagination(
					data.pagination || {
						page: 1,
						limit: 20,
						totalCount: 0,
						totalPages: 0,
					},
				);
			} catch (error) {
				console.error('Error loading movies:', error);
			} finally {
				setLoading(false);
			}
		},
		[apiUrl, currentPage, currentSearch, limit],
	);

	// Initial load and URL param changes
	useEffect(() => {
		fetchMovies(currentPage, currentSearch);
	}, [fetchMovies, currentPage, currentSearch]);

	// Handle search - simple and direct
	const handleSearch = useCallback(
		(query: string) => {
			// Fetch movies with new search
			fetchMovies(1, query);

			// Update URL without causing React Router re-render
			if (globalThis.window !== undefined) {
				const newParams = new URLSearchParams(searchParams);
				if (query) {
					newParams.set('search', query);
				} else {
					newParams.delete('search');
				}

				newParams.set('page', '1');

				const newUrl = `${globalThis.location.pathname}?${newParams.toString()}`;
				globalThis.history.replaceState({}, '', newUrl);
			}
		},
		[fetchMovies, searchParams],
	);

	// Handle delete
	const handleDelete = async (movieId: string, movieTitle: string) => {
		const success = await deleteMovie(movieId, movieTitle, apiUrl);
		if (success) {
			fetchMovies(currentPage, currentSearch);
		}
	};

	// Handle merge
	const handleMerge = async (sourceId: string, sourceTitle: string) => {
		const targetId = showMergeDialog(sourceId, sourceTitle);
		if (targetId) {
			const success = await mergeMovies(
				sourceId,
				targetId,
				sourceTitle,
				apiUrl,
			);
			if (success) {
				fetchMovies(currentPage, currentSearch);
			}
		}
	};

	if (loading) {
		return (
			<div
				style={{
					maxWidth: '1200px',
					margin: '0 auto',
					padding: '2rem',
				}}
			>
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						marginBottom: '2rem',
					}}
				>
					<h1 style={{color: '#333', margin: 0}}>Movies Management</h1>
					<div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
						<a
							href="/"
							style={{
								padding: '0.5rem 1rem',
								background: '#16a34a',
								color: 'white',
								textDecoration: 'none',
								borderRadius: '4px',
								fontSize: '0.875rem',
							}}
						>
							トップページ
						</a>
						<a
							href="/admin/movies/selections"
							style={{
								padding: '0.5rem 1rem',
								background: '#4f46e5',
								color: 'white',
								textDecoration: 'none',
								borderRadius: '4px',
								fontSize: '0.875rem',
							}}
						>
							Movie Selections
						</a>
						<button
							onClick={handleLogout}
							style={{
								padding: '0.5rem 1rem',
								background: '#dc2626',
								color: 'white',
								border: 'none',
								borderRadius: '4px',
								cursor: 'pointer',
								fontSize: '0.875rem',
							}}
						>
							Logout
						</button>
					</div>
				</div>
				<div
					style={{
						background: 'white',
						borderRadius: '8px',
						boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
						overflow: 'hidden',
					}}
				>
					<div
						style={{
							textAlign: 'center',
							padding: '3rem',
							color: '#666',
						}}
					>
						Loading movies...
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			style={{
				maxWidth: '1200px',
				margin: '0 auto',
				padding: '2rem',
			}}
		>
			{/* Header */}
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					marginBottom: '2rem',
				}}
			>
				<h1 style={{color: '#333', margin: 0}}>Movies Management</h1>
				<div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
					<a
						href="/"
						style={{
							padding: '0.5rem 1rem',
							background: '#16a34a',
							color: 'white',
							textDecoration: 'none',
							borderRadius: '4px',
							fontSize: '0.875rem',
							transition: 'background-color 0.2s',
						}}
						onMouseOver={(e) => (e.currentTarget.style.background = '#15803d')}
						onMouseOut={(e) => (e.currentTarget.style.background = '#16a34a')}
					>
						トップページ
					</a>
					<a
						href="/admin/movies/selections"
						style={{
							padding: '0.5rem 1rem',
							background: '#4f46e5',
							color: 'white',
							textDecoration: 'none',
							borderRadius: '4px',
							fontSize: '0.875rem',
							transition: 'background-color 0.2s',
						}}
						onMouseOver={(e) => (e.currentTarget.style.background = '#4338ca')}
						onMouseOut={(e) => (e.currentTarget.style.background = '#4f46e5')}
					>
						Movie Selections
					</a>
					<button
						onClick={handleLogout}
						style={{
							padding: '0.5rem 1rem',
							background: '#dc2626',
							color: 'white',
							border: 'none',
							borderRadius: '4px',
							cursor: 'pointer',
							fontSize: '0.875rem',
						}}
						onMouseOver={(e) => (e.currentTarget.style.background = '#b91c1c')}
						onMouseOut={(e) => (e.currentTarget.style.background = '#dc2626')}
					>
						Logout
					</button>
				</div>
			</div>

			{/* Search */}
			<SearchInput initialValue={currentSearch} onSearchChange={handleSearch} />

			{/* Movies Table */}
			<div
				style={{
					background: 'white',
					borderRadius: '8px',
					boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
					overflow: 'hidden',
				}}
			>
				<MoviesList
					movies={movies}
					onDelete={handleDelete}
					onMerge={handleMerge}
				/>
			</div>

			{/* Pagination */}
			{pagination.totalPages > 1 && (
				<div
					style={{
						display: 'flex',
						justifyContent: 'center',
						alignItems: 'center',
						gap: '1rem',
						marginTop: '2rem',
					}}
				>
					<button
						disabled={pagination.page === 1}
						onClick={() => {
							if (pagination.page > 1) {
								const newSearchParams = new URLSearchParams();
								if (currentSearch) {
									newSearchParams.set('search', currentSearch);
								}

								newSearchParams.set('page', (pagination.page - 1).toString());
								newSearchParams.set('limit', limit.toString());
								navigate(`?${newSearchParams.toString()}`);
							}
						}}
						style={{
							padding: '0.5rem 1rem',
							border: '1px solid #e5e7eb',
							background: pagination.page === 1 ? '#f3f4f6' : 'white',
							color: pagination.page === 1 ? '#9ca3af' : '#374151',
							borderRadius: '4px',
							cursor: pagination.page === 1 ? 'not-allowed' : 'pointer',
							opacity: pagination.page === 1 ? 0.5 : 1,
						}}
					>
						Previous
					</button>
					<span style={{color: '#6b7280'}}>
						Page {pagination.page} of {pagination.totalPages}
					</span>
					<button
						disabled={pagination.page === pagination.totalPages}
						onClick={() => {
							if (pagination.page < pagination.totalPages) {
								const newSearchParams = new URLSearchParams();
								if (currentSearch) {
									newSearchParams.set('search', currentSearch);
								}

								newSearchParams.set('page', (pagination.page + 1).toString());
								newSearchParams.set('limit', limit.toString());
								navigate(`?${newSearchParams.toString()}`);
							}
						}}
						style={{
							padding: '0.5rem 1rem',
							border: '1px solid #e5e7eb',
							background:
								pagination.page === pagination.totalPages ? '#f3f4f6' : 'white',
							color:
								pagination.page === pagination.totalPages
									? '#9ca3af'
									: '#374151',
							borderRadius: '4px',
							cursor:
								pagination.page === pagination.totalPages
									? 'not-allowed'
									: 'pointer',
							opacity: pagination.page === pagination.totalPages ? 0.5 : 1,
						}}
					>
						Next
					</button>
				</div>
			)}
		</div>
	);
}
