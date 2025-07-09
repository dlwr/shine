import {useState} from 'react';

type PosterUrl = {
	uid: string;
	url: string;
	width: number | undefined;
	height: number | undefined;
	languageCode: string | undefined;
	source: string | undefined;
	isPrimary: number;
};

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
	posters: PosterUrl[];
};

type PosterManagerProps = {
	movieId: string;
	apiUrl: string;
	posters: PosterUrl[];
	onPostersUpdate: (movieData: MovieDetails) => void;
};

export default function PosterManager({
	movieId,
	apiUrl,
	posters,
	onPostersUpdate,
}: PosterManagerProps) {
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
							? Number.parseInt(newPoster.width, 10)
							: undefined,
						height: newPoster.height
							? Number.parseInt(newPoster.height, 10)
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

			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				onPostersUpdate(data);
			}

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

			const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
				headers: {Authorization: `Bearer ${token}`},
			});

			if (movieResponse.ok) {
				const data = (await movieResponse.json()) as MovieDetails;
				onPostersUpdate(data);
			}

			globalThis.alert?.('ポスターを削除しました');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to delete poster';
			globalThis.alert?.(message);
			console.error('Delete poster error:', error);
		}
	};

	return (
		<div className="bg-white rounded-lg shadow p-6">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-medium text-gray-900">ポスター管理</h3>
				<button
					type="button"
					onClick={() => {
						setShowAddPoster(!showAddPoster);
						setPosterError(undefined);
					}}
					className="bg-green-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-green-700"
				>
					{showAddPoster ? 'キャンセル' : '+ ポスターを追加'}
				</button>
			</div>

			{posterError && (
				<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600">
					{posterError}
				</div>
			)}

			{showAddPoster && (
				<div className="mb-6 p-5 border border-gray-200 rounded-lg bg-gray-50">
					<h4 className="font-medium mb-4 text-gray-900">
						新しいポスターを追加
					</h4>
					<div className="grid grid-cols-5 gap-3 mb-3">
						<input
							type="url"
							value={newPoster.url}
							onChange={(e) =>
								setNewPoster({...newPoster, url: e.target.value})
							}
							className="col-span-5 px-3 py-2 border border-gray-300 rounded text-sm"
							placeholder="ポスターURL（必須）"
						/>
						<input
							type="number"
							value={newPoster.width}
							onChange={(e) =>
								setNewPoster({...newPoster, width: e.target.value})
							}
							className="px-3 py-2 border border-gray-300 rounded text-sm"
							placeholder="幅"
						/>
						<input
							type="number"
							value={newPoster.height}
							onChange={(e) =>
								setNewPoster({...newPoster, height: e.target.value})
							}
							className="px-3 py-2 border border-gray-300 rounded text-sm"
							placeholder="高さ"
						/>
						<input
							type="text"
							value={newPoster.languageCode}
							onChange={(e) =>
								setNewPoster({...newPoster, languageCode: e.target.value})
							}
							className="px-3 py-2 border border-gray-300 rounded text-sm"
							placeholder="言語（例: ja）"
						/>
						<input
							type="text"
							value={newPoster.source}
							onChange={(e) =>
								setNewPoster({...newPoster, source: e.target.value})
							}
							className="px-3 py-2 border border-gray-300 rounded text-sm"
							placeholder="ソース（例: TMDb）"
						/>
						<div className="flex items-center space-x-2">
							<input
								type="checkbox"
								id="isPrimary"
								checked={newPoster.isPrimary}
								onChange={(e) =>
									setNewPoster({...newPoster, isPrimary: e.target.checked})
								}
								className="mr-1"
							/>
							<label htmlFor="isPrimary" className="text-sm text-gray-700">
								プライマリ
							</label>
						</div>
					</div>
					<div className="flex space-x-2">
						<button
							type="button"
							onClick={addPoster}
							className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
						>
							追加
						</button>
						<button
							type="button"
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
							className="bg-white text-gray-700 px-4 py-2 rounded text-sm border border-gray-300 hover:bg-gray-50"
						>
							キャンセル
						</button>
					</div>
				</div>
			)}

			<div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
				{posters.length === 0 ? (
					<p className="col-span-full text-gray-500 italic">
						ポスターがありません
					</p>
				) : (
					posters.map((poster) => (
						<div
							key={poster.uid}
							className="relative border border-gray-200 rounded-lg overflow-hidden bg-white"
						>
							<img
								src={poster.url}
								alt="Movie poster"
								className="w-full h-48 object-cover"
								loading="lazy"
							/>
							<div className="p-2">
								{poster.isPrimary === 1 && (
									<span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded mb-1">
										プライマリ
									</span>
								)}
								{poster.languageCode && (
									<p className="text-xs text-gray-600">
										言語: {poster.languageCode}
									</p>
								)}
								{poster.source && (
									<p className="text-xs text-gray-600">
										ソース: {poster.source}
									</p>
								)}
								{poster.width && poster.height && (
									<p className="text-xs text-gray-600">
										{poster.width} × {poster.height}
									</p>
								)}
							</div>
							<button
								type="button"
								onClick={async () => deletePoster(poster.uid)}
								className="absolute top-2 right-2 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs hover:bg-red-700"
								title="削除"
							>
								×
							</button>
						</div>
					))
				)}
			</div>
		</div>
	);
}
