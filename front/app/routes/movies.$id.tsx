import type {Route} from './+types/movies.$id';

type MovieDetailData = {
	movieUid: string;
	movie: {
		imdbId: string;
		tmdbId: number;
		year: number;
		duration: number;
		createdAt: string;
		updatedAt: string;
	};
	translations?: Array<{
		languageCode: string;
		resourceType: string;
		content: string;
	}>;
	posterUrls?: Array<{
		posterUid: string;
		url: string;
		width: number;
		height: number;
		isPrimary: boolean;
		languageCode: string;
		source: string;
	}>;
	nominations?: Array<{
		nominationUid: string;
		isWinner: boolean;
		category: {
			categoryUid: string;
			name: string;
		};
		ceremony: {
			ceremonyUid: string;
			name: string;
			year: number;
		};
	}>;
};

export function meta({data}: Route.MetaArgs): Route.MetaDescriptors {
	if (data && 'error' in data && data.error) {
		return [
			{title: '映画が見つかりません | SHINE'},
			{name: 'description', content: '指定された映画は見つかりませんでした。'},
		];
	}

	const movieDetail = data?.movieDetail as unknown as MovieDetailData;
	const title =
		movieDetail.translations?.find((t) => t.languageCode === 'ja')?.content ||
		'映画詳細';

	return [
		{title: `${title} (${movieDetail.movie.year}) | SHINE`},
		{
			name: 'description',
			content: `${title} (${movieDetail.movie.year}年) の詳細情報。受賞歴、ポスター、その他の情報をご覧いただけます。`,
		},
	];
}

export async function loader({context, params, request}: Route.LoaderArgs) {
	try {
		const apiUrl =
			context.cloudflare.env.PUBLIC_API_URL || 'http://localhost:8787';
		const response = await fetch(`${apiUrl}/movies/${params.id}`, {
			signal: request.signal, // React Router v7推奨：abortシグナル
		});

		if (response.status === 404) {
			return {
				error: '映画が見つかりませんでした',
				status: 404,
			};
		}

		if (!response.ok) {
			return {
				error: 'データの取得に失敗しました',
				status: response.status,
			};
		}

		const movieDetail = await response.json();
		return {movieDetail};
	} catch {
		return {
			error: 'APIへの接続に失敗しました',
			status: 500,
		};
	}
}

export default function MovieDetail({loaderData}: Route.ComponentProps) {
	if ('error' in loaderData) {
		const title =
			loaderData.status === 404
				? '映画が見つかりません'
				: 'エラーが発生しました';

		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
					<h1 className="text-xl font-bold text-red-600 mb-4">{title}</h1>
					<p className="text-gray-700 mb-6">{loaderData.error}</p>
					<a
						href="/"
						className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
					>
						ホームに戻る
					</a>
				</div>
			</div>
		);
	}

	const {movieDetail} = loaderData as unknown as {
		movieDetail: MovieDetailData;
	};
	const title =
		movieDetail?.translations?.find((t: any) => t.languageCode === 'ja')
			?.content || 'タイトル不明';
	const posterUrl =
		movieDetail?.posterUrls?.find((p: any) => p.isPrimary)?.url ||
		movieDetail?.posterUrls?.[0]?.url;

	const winningNominations =
		movieDetail?.nominations?.filter((n: any) => n.isWinner) || [];
	const nominees =
		movieDetail?.nominations?.filter((n: any) => !n.isWinner) || [];

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-6xl mx-auto px-4 py-8">
				{/* ナビゲーション */}
				<nav className="mb-8">
					<a
						href="/"
						className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
					>
						← ホームに戻る
					</a>
				</nav>

				<div className="grid lg:grid-cols-3 gap-8">
					{/* ポスター */}
					<div className="lg:col-span-1">
						{posterUrl && (
							<img
								src={posterUrl}
								alt={title}
								className="w-full max-w-sm mx-auto rounded-lg shadow-lg"
							/>
						)}
					</div>

					{/* 映画情報 */}
					<div className="lg:col-span-2 space-y-6">
						<header>
							<h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
							<div className="flex flex-wrap gap-4 text-gray-600">
								<span>{movieDetail?.movie.year}年</span>
								<span>{movieDetail?.movie.duration}分</span>
								<span>IMDb: {movieDetail?.movie.imdbId}</span>
							</div>
						</header>

						{/* 受賞・ノミネート情報 */}
						{(winningNominations.length > 0 || nominees.length > 0) && (
							<section>
								<h2 className="text-xl font-semibold text-gray-800 mb-4">
									受賞・ノミネート
								</h2>
								<div className="space-y-3">
									{/* 受賞 */}
									{winningNominations.map((nomination: any, index: number) => (
										<div
											key={index}
											className="inline-block bg-yellow-400 text-yellow-900 px-3 py-2 rounded-lg mr-2 mb-2"
										>
											🏆 {nomination.ceremony.name} {nomination.ceremony.year}{' '}
											受賞
											<div className="text-xs mt-1">
												{nomination.category.name}
											</div>
										</div>
									))}

									{/* ノミネート */}
									{nominees.map((nomination: any, index: number) => (
										<div
											key={index}
											className="inline-block bg-gray-200 text-gray-800 px-3 py-2 rounded-lg mr-2 mb-2"
										>
											🎬 {nomination.ceremony.name} {nomination.ceremony.year}{' '}
											ノミネート
											<div className="text-xs mt-1">
												{nomination.category.name}
											</div>
										</div>
									))}
								</div>
							</section>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
