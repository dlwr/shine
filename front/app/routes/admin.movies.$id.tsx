import {useEffect, useState} from 'react';
import type {Route} from './+types/admin.movies.$id';
import TranslationManager from '../components/translation-manager';
import PosterManager from '../components/poster-manager';
import MovieInfoEditor from '../components/movie-info-editor';
import NominationList from '../components/nomination-list';

type Translation = {
	uid: string;
	languageCode: string;
	content: string;
	isDefault: number;
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
	isPrimary: number;
};

type MovieDetails = {
	uid: string;
	year: number;
	originalLanguage: string;
	imdbId: string | undefined;
	tmdbId: number | undefined;
	translations: Translation[];
	nominations: Nomination[];
	posters: PosterUrl[];
};

type LoaderData = {
	apiUrl: string;
	movieId: string;
};

export function meta({data: _data}: Route.MetaArgs): Route.MetaDescriptors {
	return [
		{title: '映画編集 - SHINE Admin'},
		{name: 'description', content: 'SHINE管理画面 - 映画情報編集'},
	];
}

export async function loader({context, params}: Route.LoaderArgs) {
	const apiUrl =
		(context.cloudflare as {env: {PUBLIC_API_URL?: string}}).env
			.PUBLIC_API_URL || 'http://localhost:8787';

	return {
		apiUrl,
		movieId: params.id,
	};
}

const handleLogout = () => {
	if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
		globalThis.localStorage.removeItem('adminToken');
		globalThis.location.href = '/admin/login';
	}
};

export default function AdminMovieEdit({loaderData}: Route.ComponentProps) {
	const {apiUrl, movieId} = loaderData as LoaderData;

	const [movieData, setMovieData] = useState<MovieDetails | undefined>(
		undefined,
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

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
				setMovieData({
					...data,
					translations: data.translations || [],
					nominations: data.nominations || [],
					posters: data.posters || [],
				});
			} catch (error) {
				console.error('Error loading movie:', error);
				setError('Failed to load movie data');
			} finally {
				setLoading(false);
			}
		};

		loadMovie();
	}, [apiUrl, movieId]);

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-100 flex items-center justify-center">
				<div className="text-lg">読み込み中...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen bg-gray-100 flex items-center justify-center">
				<div className="text-red-600">{error}</div>
			</div>
		);
	}

	if (!movieData) {
		return (
			<div className="min-h-screen bg-gray-100 flex items-center justify-center">
				<div className="text-gray-600">映画データが見つかりません</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-100">
			<header className="bg-white shadow">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="flex justify-between items-center py-6">
						<h1 className="text-3xl font-bold text-gray-900">映画編集</h1>
						<div className="flex space-x-4">
							<a
								href="/"
								className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
							>
								トップページ
							</a>
							<a
								href="/admin/movies"
								className="bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-700"
							>
								← 一覧に戻る
							</a>
							<button
								type="button"
								onClick={handleLogout}
								className="bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700"
							>
								ログアウト
							</button>
						</div>
					</div>
				</div>
			</header>

			<main className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
				<div className="space-y-6">
					<MovieInfoEditor
						movieData={movieData}
						apiUrl={apiUrl}
						movieId={movieId}
						onMovieDataUpdate={setMovieData}
					/>

					<TranslationManager
						movieId={movieId}
						apiUrl={apiUrl}
						translations={movieData.translations}
						onTranslationsUpdate={setMovieData}
					/>

					<NominationList nominations={movieData.nominations} />

					<PosterManager
						movieId={movieId}
						apiUrl={apiUrl}
						posters={movieData.posters}
						onPostersUpdate={setMovieData}
					/>
				</div>
			</main>
		</div>
	);
}
