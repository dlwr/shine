import {eq, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '../../src';
import {movies} from '../../src/schema/movies';
import {posterUrls} from '../../src/schema/poster-urls';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

type TMDBMovieImages = {
	id: number;
	posters: Array<{
		file_path: string;
		width: number;
		height: number;
		iso_639_1: string | undefined;
	}>;
};

type TMDBMovieData = {
	id: number;
	title: string;
	original_title: string;
	release_date: string;
};

type TMDBFindResponse = {
	movie_results: TMDBMovieData[];
};

type MovieWithImdbId = {
	uid: string;
	imdbId: string;
	tmdbId: number | undefined;
};

let environment_: Environment;
let TMDB_API_KEY: string | undefined;

export default {
	async fetch(request: Request, environment: Environment): Promise<Response> {
		environment_ = environment;
		TMDB_API_KEY = environment.TMDB_API_KEY;

		if (!TMDB_API_KEY) {
			return new Response('TMDB_API_KEY is not set', {status: 500});
		}

		try {
			const url = new URL(request.url);
			const processCountParameter = url.searchParams.get('count');
			const processCount = processCountParameter
				? Number.parseInt(processCountParameter, 10)
				: 10;

			const result = await fetchAndStorePosterUrls(processCount);
			return new Response(JSON.stringify(result), {
				status: 200,
				headers: {'Content-Type': 'application/json'},
			});
		} catch (error) {
			console.error('Error processing posters:', error);
			return new Response(
				`Error: ${error instanceof Error ? error.message : String(error)}`,
				{status: 500},
			);
		}
	},
};

async function getMoviesWithImdbId(limit = 10): Promise<MovieWithImdbId[]> {
	const database = getDatabase(environment_);

	// まず、ポスターがない映画を優先的に取得（TMDB IDもない映画を優先）
	const moviesWithoutPosters = await database
		.select({uid: movies.uid, imdbId: movies.imdbId, tmdbId: movies.tmdbId})
		.from(movies)
		.leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
		.where(
			sql`${movies.imdbId} IS NOT NULL AND ${posterUrls.uid} IS NULL AND ${movies.tmdbId} IS NULL`,
		)
		.limit(limit);

	const filteredMoviesWithoutPosters = moviesWithoutPosters
		.filter((movie) => movie.imdbId !== null)
		.map((movie) => ({
			...movie,
			tmdbId: movie.tmdbId ?? undefined,
		})) as MovieWithImdbId[];

	if (filteredMoviesWithoutPosters.length > 0) {
		return filteredMoviesWithoutPosters;
	}

	// ポスターがない映画（TMDB IDがある映画）
	const moviesWithoutPostersButWithTmdb = await database
		.select({uid: movies.uid, imdbId: movies.imdbId, tmdbId: movies.tmdbId})
		.from(movies)
		.leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
		.where(
			sql`${movies.imdbId} IS NOT NULL AND ${posterUrls.uid} IS NULL AND ${movies.tmdbId} IS NOT NULL`,
		)
		.limit(limit);

	const filteredMoviesWithoutPostersButWithTmdb =
		moviesWithoutPostersButWithTmdb
			.filter((movie) => movie.imdbId !== null)
			.map((movie) => ({
				...movie,
				tmdbId: movie.tmdbId ?? undefined,
			})) as MovieWithImdbId[];

	if (filteredMoviesWithoutPostersButWithTmdb.length > 0) {
		return filteredMoviesWithoutPostersButWithTmdb;
	}

	// 最後に、TMDB IDがない映画を取得
	const moviesWithImdbIdNoTmdb = await database
		.select({uid: movies.uid, imdbId: movies.imdbId, tmdbId: movies.tmdbId})
		.from(movies)
		.where(sql`${movies.imdbId} IS NOT NULL AND ${movies.tmdbId} IS NULL`)
		.limit(limit);

	return moviesWithImdbIdNoTmdb
		.filter((movie) => movie.imdbId !== null)
		.map((movie) => ({
			...movie,
			tmdbId: movie.tmdbId ?? undefined,
		})) as MovieWithImdbId[];
}

async function fetchMovieImages(
	imdbId: string,
): Promise<{images: TMDBMovieImages; tmdbId: number} | undefined> {
	if (!TMDB_API_KEY) {
		console.error('TMDb API key is not set');
		return undefined;
	}

	try {
		const findUrl = new URL(`${TMDB_API_BASE_URL}/find/${imdbId}`);
		findUrl.searchParams.append('api_key', TMDB_API_KEY);
		findUrl.searchParams.append('external_source', 'imdb_id');

		const findResponse = await fetch(findUrl.toString());
		if (!findResponse.ok) {
			throw new Error(`TMDb API error: ${findResponse.statusText}`);
		}

		const findData = (await findResponse.json()) as TMDBFindResponse;
		const movieResults = findData.movie_results;

		if (!movieResults || movieResults.length === 0) {
			console.log(`No TMDb match found for IMDb ID: ${imdbId}`);
			return undefined;
		}

		const tmdbId = movieResults[0].id;

		const imagesUrl = new URL(`${TMDB_API_BASE_URL}/movie/${tmdbId}/images`);
		imagesUrl.searchParams.append('api_key', TMDB_API_KEY);

		const imagesResponse = await fetch(imagesUrl.toString());
		if (!imagesResponse.ok) {
			throw new Error(`TMDb API error: ${imagesResponse.statusText}`);
		}

		const images = (await imagesResponse.json()) as TMDBMovieImages;
		return {images, tmdbId};
	} catch (error) {
		console.error(`Error fetching TMDb images for IMDb ID ${imdbId}:`, error);
		return undefined;
	}
}

async function saveTMDBId(movieUid: string, tmdbId: number): Promise<void> {
	const database = getDatabase(environment_);

	try {
		// 既存のTMDB IDをチェック（この映画に対して）
		const existingMovie = await database
			.select({tmdbId: movies.tmdbId})
			.from(movies)
			.where(eq(movies.uid, movieUid))
			.limit(1);

		if (existingMovie.length > 0 && existingMovie[0].tmdbId !== null) {
			console.log(`  ! TMDB ID は既に存在します: ${existingMovie[0].tmdbId}`);
			return;
		}

		// 他の映画で同じTMDB IDが使用されていないかチェック
		const duplicateMovie = await database
			.select({uid: movies.uid, tmdbId: movies.tmdbId})
			.from(movies)
			.where(eq(movies.tmdbId, tmdbId))
			.limit(1);

		if (duplicateMovie.length > 0) {
			console.log(
				`  ! TMDB ID ${tmdbId} は他の映画で既に使用されています (${duplicateMovie[0].uid})`,
			);
			return;
		}

		// TMDB IDを更新
		await database.update(movies).set({tmdbId}).where(eq(movies.uid, movieUid));

		console.log(`  ✓ TMDB ID を保存しました: ${tmdbId}`);
	} catch (error) {
		console.error(`Error saving TMDB ID for movie ${movieUid}:`, error);
	}
}

async function savePosterUrls(
	movieUid: string,
	posters: TMDBMovieImages['posters'],
): Promise<number> {
	if (!posters || posters.length === 0) {
		return 0;
	}

	const database = getDatabase(environment_);
	let savedCount = 0;

	try {
		const existingPosters = await database
			.select({url: posterUrls.url})
			.from(posterUrls)
			.where(eq(posterUrls.movieUid, movieUid));

		const existingUrls = new Set(existingPosters.map((p) => p.url));

		for (const poster of posters) {
			const url = `https://image.tmdb.org/t/p/original${poster.file_path}`;

			if (existingUrls.has(url)) {
				continue;
			}

			await database.insert(posterUrls).values({
				movieUid,
				url,
				width: poster.width,
				height: poster.height,
				languageCode: poster.iso_639_1 || undefined,
				sourceType: 'tmdb',
				isPrimary: savedCount === 0 ? 1 : 0,
			});

			savedCount++;
		}

		return savedCount;
	} catch (error) {
		console.error(`Error saving poster URLs for movie ${movieUid}:`, error);
		throw error;
	}
}

async function fetchAndStorePosterUrls(limit = 10): Promise<{
	processed: number;
	success: number;
	failed: number;
	results: Array<{
		movieUid: string;
		imdbId: string;
		postersAdded: number;
		error?: string;
	}>;
}> {
	const moviesWithImdbId = await getMoviesWithImdbId(limit);
	console.log(`処理対象の映画: ${moviesWithImdbId.length}件`);

	const results: {
		processed: number;
		success: number;
		failed: number;
		results: Array<{
			movieUid: string;
			imdbId: string;
			postersAdded: number;
			error?: string;
		}>;
	} = {
		processed: 0,
		success: 0,
		failed: 0,
		results: [],
	};

	for (const movie of moviesWithImdbId) {
		console.log(
			`[${results.processed + 1}/${
				moviesWithImdbId.length
			}] 処理開始: IMDb ID ${movie.imdbId}`,
		);

		results.processed++;
		const result: {
			movieUid: string;
			imdbId: string;
			postersAdded: number;
			error?: string;
		} = {
			movieUid: movie.uid,
			imdbId: movie.imdbId,
			postersAdded: 0,
		};

		try {
			// 既にTMDB IDがある映画の場合、ポスター取得のみ行う
			if (movie.tmdbId === null) {
				// TMDB IDがない場合は、IMDb IDから検索
				console.log(`  TMDb API からポスター情報を取得中...`);
				const movieData = await fetchMovieImages(movie.imdbId);

				if (movieData) {
					// TMDB ID を保存
					await saveTMDBId(movie.uid, movieData.tmdbId);

					if (
						!movieData.images.posters ||
						movieData.images.posters.length === 0
					) {
						result.error = 'No posters found';
						results.failed++;
						console.log(`  ✘ ポスターが見つかりませんでした`);
					} else {
						console.log(
							`  ポスター候補: ${movieData.images.posters.length}枚見つかりました`,
						);
						console.log(`  データベースに保存中...`);
						const savedCount = await savePosterUrls(
							movie.uid,
							movieData.images.posters,
						);
						result.postersAdded = savedCount;

						if (savedCount > 0) {
							results.success++;
							console.log(`  ✓ ${savedCount}枚のポスターを保存しました`);
						} else {
							results.failed++;
							result.error = 'No new posters saved';
							console.log(`  ✘ 新しいポスターはありませんでした`);
						}
					}
				} else {
					result.error = 'No TMDb data found';
					results.failed++;
					console.log(`  ✘ TMDb データが見つかりませんでした`);
				}
			} else {
				console.log(`  既存のTMDB ID を使用: ${movie.tmdbId}`);

				// TMDB IDから直接ポスター情報を取得
				const imagesUrl = new URL(
					`${TMDB_API_BASE_URL}/movie/${movie.tmdbId}/images`,
				);
				imagesUrl.searchParams.append('api_key', TMDB_API_KEY!);

				const imagesResponse = await fetch(imagesUrl.toString());
				if (!imagesResponse.ok) {
					throw new Error(`TMDb API error: ${imagesResponse.statusText}`);
				}

				const images = (await imagesResponse.json()) as TMDBMovieImages;

				if (!images.posters || images.posters.length === 0) {
					result.error = 'No posters found';
					results.failed++;
					console.log(`  ✘ ポスターが見つかりませんでした`);
				} else {
					console.log(
						`  ポスター候補: ${images.posters.length}枚見つかりました`,
					);
					console.log(`  データベースに保存中...`);
					const savedCount = await savePosterUrls(movie.uid, images.posters);
					result.postersAdded = savedCount;

					if (savedCount > 0) {
						results.success++;
						console.log(`  ✓ ${savedCount}枚のポスターを保存しました`);
					} else {
						results.failed++;
						result.error = 'No new posters saved';
						console.log(`  ✘ 新しいポスターはありませんでした`);
					}
				}
			}
		} catch (error) {
			result.error = error instanceof Error ? error.message : String(error);
			results.failed++;
			console.log(`  ✘ エラーが発生しました: ${result.error}`);
		}

		results.results.push(result);
		console.log(
			`[${results.processed}/${moviesWithImdbId.length}] 処理完了: IMDb ID ${movie.imdbId}`,
		);
		console.log(
			`進捗状況: 成功=${results.success}, 失敗=${results.failed}, 合計=${results.processed}/${moviesWithImdbId.length}`,
		);
		console.log(`------------------------------`);
	}

	console.log(
		`処理完了: 合計=${results.processed}件 (成功=${results.success}件, 失敗=${results.failed}件)`,
	);
	const totalPosters = results.results.reduce(
		(sum, item) => sum + item.postersAdded,
		0,
	);
	console.log(`保存されたポスター数: 合計${totalPosters}枚`);

	return results;
}
